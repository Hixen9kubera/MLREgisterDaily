"""
Monitoreo de precios de competencia.

Logica del cron diario:
  1. Para cada competidor activo en watchlist, fetch precio actual via ML batch /items?ids=...
  2. Comparar con ultimo registro en diario:
     - Si precio igual -> no insertar (anti-saturacion)
     - Si precio cambio -> insertar + sliding window 3 + notificacion
  3. Si HOY es dia 1 del mes -> archivar mes anterior y limpiar diario.
  4. Si competidor lleva >=60 dias paused -> auto-desactivar.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
import logging
import statistics
import threading
import time
from typing import Any

from app.db.mysql_tokens import list_ml_tokens
from app.db.supabase_client import supabase
from app.services.ml_api import MLClient
from app.utils.tz import today_cdmx

logger = logging.getLogger(__name__)

BATCH_SIZE = 20
WORKERS = 8
MAX_DIARY_RECORDS = 3
AUTO_DEACTIVATE_AFTER_DAYS_PAUSED = 60


def watch_competitor(
    our_ml_item_id: str,
    competitor_ml_id: str,
    title: str | None = None,
    url: str | None = None,
    thumbnail: str | None = None,
    seller: str | None = None,
    brand: str | None = None,
    price: float | None = None,
) -> dict:
    """Agrega un competidor al watchlist. Si ya existe, lo reactiva."""
    sb = supabase()
    body = {
        "our_ml_item_id": our_ml_item_id,
        "competitor_ml_id": competitor_ml_id,
        "competitor_url": url,
        "title": title,
        "thumbnail": thumbnail,
        "seller": seller,
        "brand": brand,
        "initial_price": price,
        "current_price": price,
        "is_active": True,
        "paused_streak_days": 0,
    }
    r = sb.table("competitor_watchlist").upsert(
        body,
        on_conflict="our_ml_item_id,competitor_ml_id",
    ).execute()
    return r.data[0] if r.data else body


def unwatch_competitor(our_ml_item_id: str, competitor_ml_id: str, hard_delete: bool = False) -> bool:
    """Elimina (o desactiva) un competidor del watchlist."""
    sb = supabase()
    if hard_delete:
        sb.table("competitor_watchlist").delete().eq("our_ml_item_id", our_ml_item_id).eq("competitor_ml_id", competitor_ml_id).execute()
    else:
        sb.table("competitor_watchlist").update({"is_active": False}).eq("our_ml_item_id", our_ml_item_id).eq("competitor_ml_id", competitor_ml_id).execute()
    return True


def list_watched(our_ml_item_id: str | None = None, only_active: bool = True) -> list[dict]:
    sb = supabase()
    q = sb.table("competitor_watchlist").select("*")
    if our_ml_item_id:
        q = q.eq("our_ml_item_id", our_ml_item_id)
    if only_active:
        q = q.eq("is_active", True)
    return (q.order("created_at", desc=True).execute()).data or []


def list_diary(competitor_watchlist_id: int, limit: int = 50) -> list[dict]:
    sb = supabase()
    return (
        sb.table("reporte_monitoreo_competencia_diario")
        .select("*")
        .eq("competitor_watchlist_id", competitor_watchlist_id)
        .order("recorded_date", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def list_monthly_reports(competitor_watchlist_id: int) -> list[dict]:
    sb = supabase()
    return (
        sb.table("reporte_monitoreo_competencia_30day")
        .select("*")
        .eq("competitor_watchlist_id", competitor_watchlist_id)
        .order("period_year", desc=True)
        .order("period_month", desc=True)
        .execute()
    ).data or []


def _fetch_ml_items_batched(ids: list[str]) -> dict[str, dict]:
    """Llama ML /items?ids=... en batches concurrentes. Devuelve {ml_item_id: item_dict}."""
    if not ids:
        return {}
    tokens = list_ml_tokens()
    if not tokens:
        raise RuntimeError("No hay tokens ML configurados")

    out: dict[str, dict] = {}
    lock = threading.Lock()

    # Usamos UN MLClient compartido (su httpx.Client es thread-safe para requests)
    client = MLClient(tokens[0])

    def fetch_batch(chunk: list[str]):
        for attempt in range(3):
            try:
                batch = client.get_items_multi(chunk)
                with lock:
                    for it in batch:
                        if it and it.get("id"):
                            out[it["id"]] = it
                return
            except Exception as e:
                logger.warning(f"batch fail intento {attempt+1}: {e}")
                time.sleep(2.0 * (attempt + 1))

    try:
        chunks = [ids[i:i + BATCH_SIZE] for i in range(0, len(ids), BATCH_SIZE)]
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = [pool.submit(fetch_batch, c) for c in chunks]
            for _ in as_completed(futures):
                pass
    finally:
        client.close()
    return out


def _get_last_diary_record(competitor_watchlist_id: int) -> dict | None:
    sb = supabase()
    r = (
        sb.table("reporte_monitoreo_competencia_diario")
        .select("*")
        .eq("competitor_watchlist_id", competitor_watchlist_id)
        .order("recorded_date", desc=True)
        .limit(1)
        .execute()
    )
    return r.data[0] if r.data else None


def _price_changed(prev_price, new_price) -> bool:
    if prev_price is None and new_price is None:
        return False
    if prev_price is None or new_price is None:
        return True
    return abs(float(prev_price) - float(new_price)) > 0.001


def _insert_diary_and_prune(watchlist_id: int, snap: dict) -> None:
    """Inserta nueva fila en diario y mantiene solo las ultimas 3."""
    sb = supabase()
    sb.table("reporte_monitoreo_competencia_diario").upsert(
        snap, on_conflict="competitor_watchlist_id,recorded_date"
    ).execute()
    rows = (
        sb.table("reporte_monitoreo_competencia_diario")
        .select("id,recorded_date")
        .eq("competitor_watchlist_id", watchlist_id)
        .order("recorded_date", desc=True)
        .execute()
    ).data or []
    if len(rows) > MAX_DIARY_RECORDS:
        to_delete = [r["id"] for r in rows[MAX_DIARY_RECORDS:]]
        sb.table("reporte_monitoreo_competencia_diario").delete().in_("id", to_delete).execute()


def _create_price_change_notification(watch: dict, prev_price: float | None, new_price: float | None) -> None:
    sb = supabase()
    delta = (new_price or 0) - (prev_price or 0) if prev_price is not None else 0
    delta_pct = (delta / prev_price * 100) if prev_price else None
    payload = {
        "watchlist_id": watch["id"],
        "competitor_ml_id": watch["competitor_ml_id"],
        "our_ml_item_id": watch["our_ml_item_id"],
        "title": watch.get("title"),
        "thumbnail": watch.get("thumbnail"),
        "seller": watch.get("seller"),
        "old_price": prev_price,
        "new_price": new_price,
        "delta": delta,
        "delta_pct": round(delta_pct, 2) if delta_pct is not None else None,
        "direction": "up" if delta > 0 else "down" if delta < 0 else "flat",
    }
    sb.table("notifications").insert({
        "kind": "competitor_price_change",
        "payload": payload,
    }).execute()


def _archive_previous_month(watch: dict, today: date) -> None:
    """Si HOY es dia 1, archivar todo el mes anterior."""
    sb = supabase()
    if today.day != 1:
        return
    prev_month_end = today - timedelta(days=1)
    prev_year, prev_month = prev_month_end.year, prev_month_end.month
    month_start = date(prev_year, prev_month, 1)

    already = (
        sb.table("reporte_monitoreo_competencia_30day")
        .select("id")
        .eq("competitor_watchlist_id", watch["id"])
        .eq("period_year", prev_year)
        .eq("period_month", prev_month)
        .execute()
    ).data
    if already:
        return

    diary = (
        sb.table("reporte_monitoreo_competencia_diario")
        .select("*")
        .eq("competitor_watchlist_id", watch["id"])
        .gte("recorded_date", month_start.isoformat())
        .lte("recorded_date", prev_month_end.isoformat())
        .order("recorded_date")
        .execute()
    ).data or []
    if not diary:
        return

    prices = [float(d["price"]) for d in diary if d.get("price") is not None]
    if not prices:
        return

    changes_history: list[dict] = []
    prev = None
    for d in diary:
        cur = float(d["price"]) if d.get("price") is not None else None
        if cur is None:
            continue
        delta = (cur - prev) if prev is not None else 0
        delta_pct = (delta / prev * 100) if prev else None
        changes_history.append({
            "date": d["recorded_date"],
            "price": cur,
            "previous_price": prev,
            "delta": round(delta, 2),
            "delta_pct": round(delta_pct, 2) if delta_pct is not None else None,
        })
        prev = cur

    summary = {
        "competitor_watchlist_id": watch["id"],
        "competitor_ml_id": watch["competitor_ml_id"],
        "period_year": prev_year,
        "period_month": prev_month,
        "days_observed": len(diary),
        "changes_count": max(0, len(changes_history) - 1),
        "last_change_date": changes_history[-1]["date"] if changes_history else None,
        "price_first": prices[0],
        "price_last": prices[-1],
        "price_min": min(prices),
        "price_max": max(prices),
        "price_avg": round(statistics.mean(prices), 2),
        "changes_history": changes_history,
    }
    sb.table("reporte_monitoreo_competencia_30day").insert(summary).execute()

    keep_id = diary[-1]["id"]
    sb.table("reporte_monitoreo_competencia_diario").delete().eq("competitor_watchlist_id", watch["id"]).gte("recorded_date", month_start.isoformat()).lte("recorded_date", prev_month_end.isoformat()).neq("id", keep_id).execute()


def run_competitor_monitoring_job() -> dict:
    """Job diario para monitorear precios de competencia. Llamado desde el cron de 8 AM."""
    sb = supabase()
    today = today_cdmx()
    watched = list_watched(only_active=True)
    if not watched:
        return {"watched": 0, "updated": 0, "changed": 0, "notifications": 0, "archived": 0}

    ids = [w["competitor_ml_id"] for w in watched]
    t0 = time.time()
    items_by_id = _fetch_ml_items_batched(ids)
    logger.info(f"competidores: batched {len(ids)} ids -> {len(items_by_id)} fetched en {time.time()-t0:.1f}s")

    updated = 0
    changed = 0
    notif_count = 0
    archived = 0
    auto_deactivated = 0

    for w in watched:
        if today.day == 1:
            try:
                _archive_previous_month(w, today)
                archived += 1
            except Exception as e:
                logger.warning(f"archive fail wid={w['id']}: {e}")

        item = items_by_id.get(w["competitor_ml_id"])
        if not item:
            sb.table("competitor_watchlist").update({
                "current_status": "not_found",
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", w["id"]).execute()
            continue

        new_price = item.get("price")
        new_status = item.get("status")
        is_paused = new_status in ("paused", "closed", "under_review")

        prev_record = _get_last_diary_record(w["id"])
        prev_price = float(prev_record["price"]) if prev_record and prev_record.get("price") is not None else None

        if _price_changed(prev_price, new_price):
            snap = {
                "competitor_watchlist_id": w["id"],
                "competitor_ml_id": w["competitor_ml_id"],
                "price": new_price,
                "original_price": item.get("original_price"),
                "status": new_status,
                "available_quantity": item.get("available_quantity"),
                "sold_quantity": item.get("sold_quantity"),
                "recorded_date": today.isoformat(),
            }
            _insert_diary_and_prune(w["id"], snap)
            changed += 1
            if prev_record is not None:
                _create_price_change_notification(w, prev_price, new_price)
                notif_count += 1

        new_paused_streak = w.get("paused_streak_days", 0) or 0
        if is_paused:
            new_paused_streak += 1
        else:
            new_paused_streak = 0

        update_body = {
            "current_price": new_price,
            "current_status": new_status,
            "paused_streak_days": new_paused_streak,
            "last_checked_at": datetime.now(timezone.utc).isoformat(),
        }
        if new_paused_streak >= AUTO_DEACTIVATE_AFTER_DAYS_PAUSED:
            update_body["is_active"] = False
            auto_deactivated += 1
        sb.table("competitor_watchlist").update(update_body).eq("id", w["id"]).execute()
        updated += 1

    return {
        "watched": len(watched),
        "fetched": len(items_by_id),
        "updated": updated,
        "changed": changed,
        "notifications": notif_count,
        "archived": archived,
        "auto_deactivated": auto_deactivated,
        "duration_s": round(time.time() - t0, 1),
    }
