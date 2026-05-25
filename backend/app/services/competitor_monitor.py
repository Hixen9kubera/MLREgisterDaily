"""Monitoreo de precios de competencia via endpoint de catalogos de ML.

Estrategia:
  - Cada producto en watchlist guarda un catalog_id (MLMU####) extraido del URL del competidor.
  - Diariamente llamamos GET /products/{catalog_id}/items que devuelve el item ganador
    del buy-box con su precio actual. Endpoint oficial, gratis, ~200ms por request.
  - Solo se insertan nuevos registros cuando el precio cambia (sliding window 3).
  - El primer dia del mes archivamos el mes anterior y limpiamos diario.
  - Items sin catalog_id no se pueden monitorear automaticamente.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
import logging
import re
import statistics
import threading
import time

from app.db.mysql_tokens import list_ml_tokens
from app.db.supabase_client import supabase
from app.services.ml_api import MLClient
from app.utils.tz import today_cdmx

logger = logging.getLogger(__name__)

WORKERS = 12
MAX_DIARY_RECORDS = 3
AUTO_DEACTIVATE_AFTER_DAYS_PAUSED = 60

CATALOG_RE = re.compile(r"/up/(MLMU\d+)", re.IGNORECASE)
ITEM_RE = re.compile(r"MLM-?(\d{8,})", re.IGNORECASE)


def extract_catalog_id(url: str | None) -> str | None:
    """Extrae el catalog_id (MLMU####) del URL de un producto ML."""
    if not url:
        return None
    m = CATALOG_RE.search(url)
    if m:
        return m.group(1).upper()
    return None


def fetch_catalog_winner(catalog_id: str, client: MLClient) -> dict | None:
    """Llama /products/{catalog_id}/items y devuelve el ganador del buy-box."""
    try:
        data = client._get(f"/products/{catalog_id}/items")
        results = data.get("results") or []
        if not results:
            return None
        return results[0]
    except Exception as e:
        logger.debug(f"catalog {catalog_id} fail: {e}")
        return None


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
    """Agrega un competidor al watchlist usando el catalog_id como llave de monitoreo.

    Si el URL contiene /up/MLMU####, extrae el catalog_id y llama al endpoint de catalogo
    para obtener el item_id real + precio actual. Si no, lo guarda con catalog_id=null.
    """
    catalog_id = extract_catalog_id(url)
    resolved_item_id = competitor_ml_id
    resolved_price = price
    resolved_seller = seller

    if catalog_id:
        tokens = list_ml_tokens()
        if tokens:
            try:
                with MLClient(tokens[0]) as cli:
                    winner = fetch_catalog_winner(catalog_id, cli)
                    if winner:
                        resolved_item_id = str(winner.get("item_id") or competitor_ml_id)
                        if winner.get("price") is not None:
                            resolved_price = float(winner["price"])
                        sellr = (winner.get("seller") or {}).get("nickname")
                        if sellr:
                            resolved_seller = sellr
            except Exception as e:
                logger.warning(f"resolve catalog {catalog_id} fail: {e}")

    sb = supabase()
    body = {
        "our_ml_item_id": our_ml_item_id,
        "competitor_ml_id": resolved_item_id,
        "catalog_id": catalog_id,
        "competitor_url": url,
        "title": title,
        "thumbnail": thumbnail,
        "seller": resolved_seller,
        "brand": brand,
        "initial_price": resolved_price,
        "current_price": resolved_price,
        "is_active": True,
        "paused_streak_days": 0,
    }
    r = sb.table("competitor_watchlist").upsert(
        body,
        on_conflict="our_ml_item_id,competitor_ml_id",
    ).execute()
    return r.data[0] if r.data else body


def unwatch_competitor(our_ml_item_id: str, competitor_ml_id: str, hard_delete: bool = False) -> bool:
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


def _fetch_catalog_prices_concurrent(watched: list[dict]) -> dict[int, dict]:
    """Para cada watched con catalog_id, hace GET /products/{cat}/items en paralelo.

    Devuelve {watchlist_id: {item_id, price, status, seller_nickname, raw}}.
    """
    tokens = list_ml_tokens()
    if not tokens:
        raise RuntimeError("No hay tokens ML configurados")

    out: dict[int, dict] = {}
    lock = threading.Lock()

    eligible = [w for w in watched if w.get("catalog_id")]
    if not eligible:
        return out

    client = MLClient(tokens[0])

    def fetch_one(w: dict):
        cat_id = w["catalog_id"]
        for attempt in range(3):
            try:
                winner = fetch_catalog_winner(cat_id, client)
                if winner is None:
                    return
                payload = {
                    "item_id": str(winner.get("item_id") or ""),
                    "price": winner.get("price"),
                    "original_price": winner.get("original_price"),
                    "available_quantity": winner.get("available_quantity"),
                    "sold_quantity": winner.get("sold_quantity"),
                    "status": winner.get("status") or "active",
                    "seller_nickname": (winner.get("seller") or {}).get("nickname"),
                    "raw": winner,
                }
                with lock:
                    out[w["id"]] = payload
                return
            except Exception as e:
                logger.warning(f"catalog {cat_id} attempt {attempt+1} fail: {e}")
                time.sleep(0.5 * (attempt + 1))

    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = [pool.submit(fetch_one, w) for w in eligible]
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
    """Job diario que actualiza precios de competidores via endpoint de catalogos."""
    sb = supabase()
    today = today_cdmx()
    watched = list_watched(only_active=True)
    if not watched:
        return {"watched": 0, "fetched": 0, "updated": 0, "changed": 0, "notifications": 0, "archived": 0}

    t0 = time.time()
    prices = _fetch_catalog_prices_concurrent(watched)
    duration = round(time.time() - t0, 1)
    logger.info(f"competidores: fetch {len(prices)}/{len(watched)} en {duration}s")

    updated = changed = notif_count = archived = auto_deactivated = no_catalog = 0
    for w in watched:
        if today.day == 1:
            try:
                _archive_previous_month(w, today)
                archived += 1
            except Exception as e:
                logger.warning(f"archive fail wid={w['id']}: {e}")

        if not w.get("catalog_id"):
            no_catalog += 1
            continue

        info = prices.get(w["id"])
        if not info:
            sb.table("competitor_watchlist").update({
                "current_status": "not_found",
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", w["id"]).execute()
            continue

        new_price = info.get("price")
        new_status = info.get("status")
        is_paused = new_status in ("paused", "closed", "under_review")

        prev_record = _get_last_diary_record(w["id"])
        prev_price = float(prev_record["price"]) if prev_record and prev_record.get("price") is not None else None

        if _price_changed(prev_price, new_price):
            snap = {
                "competitor_watchlist_id": w["id"],
                "competitor_ml_id": info.get("item_id") or w["competitor_ml_id"],
                "price": new_price,
                "original_price": info.get("original_price"),
                "status": new_status,
                "available_quantity": info.get("available_quantity"),
                "sold_quantity": info.get("sold_quantity"),
                "recorded_date": today.isoformat(),
                "raw": info.get("raw"),
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
        if info.get("item_id") and info["item_id"] != w["competitor_ml_id"]:
            update_body["competitor_ml_id"] = info["item_id"]
        if info.get("seller_nickname"):
            update_body["seller"] = info["seller_nickname"]
        if new_paused_streak >= AUTO_DEACTIVATE_AFTER_DAYS_PAUSED:
            update_body["is_active"] = False
            auto_deactivated += 1
        sb.table("competitor_watchlist").update(update_body).eq("id", w["id"]).execute()
        updated += 1

    return {
        "watched": len(watched),
        "fetched": len(prices),
        "no_catalog": no_catalog,
        "updated": updated,
        "changed": changed,
        "notifications": notif_count,
        "archived": archived,
        "auto_deactivated": auto_deactivated,
        "duration_s": duration,
    }
