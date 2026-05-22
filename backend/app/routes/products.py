from datetime import date, timedelta
from typing import Literal
from fastapi import APIRouter, HTTPException, Query

from app.db.supabase_client import supabase
from app.routes.goals import _iso_monday
from app.services.competition import fetch_competition, get_cached
from app.utils.tz import today_cdmx, cdmx_day_to_utc_range

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
def list_products(
    account_id: str | None = None,
    q: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    sb = supabase()
    today_iso = today_cdmx().isoformat()

    res = (
        sb.table("products_snapshot")
        .select(
            "ml_item_id,account_id,title,seller_sku,price,available_quantity,sold_quantity,status,thumbnail,permalink,snapshot_date",
            count="exact",
        )
        .eq("snapshot_date", today_iso)
    )
    if account_id:
        res = res.eq("account_id", account_id)
    if q:
        like = f"%{q}%"
        res = res.or_(f"title.ilike.{like},seller_sku.ilike.{like},ml_item_id.ilike.{like}")
    res = res.order("title").range(offset, offset + limit - 1)
    data = res.execute()
    return {"items": data.data or [], "count": data.count}


@router.get("/with-changes")
def products_with_changes(
    range: Literal["today", "week"] = "today",
    account_id: str | None = None,
    limit: int = Query(default=20, le=200),
):
    sb = supabase()
    today = today_cdmx()
    if range == "today":
        start = today
    else:
        start = _iso_monday(today)
    end = today

    q = (
        sb.table("product_changes")
        .select("ml_item_id,account_id,snapshot_date,field_name")
        .gte("snapshot_date", start.isoformat())
        .lte("snapshot_date", end.isoformat())
    )
    if account_id:
        q = q.eq("account_id", account_id)
    changes = (q.execute()).data or []
    if not changes:
        return {"start": start.isoformat(), "end": end.isoformat(), "items": []}

    by_item: dict[str, dict] = {}
    for c in changes:
        b = by_item.setdefault(
            c["ml_item_id"],
            {
                "ml_item_id": c["ml_item_id"],
                "account_id": c["account_id"],
                "changes_count": 0,
                "fields_changed": set(),
                "last_change_date": c["snapshot_date"],
            },
        )
        b["changes_count"] += 1
        b["fields_changed"].add(c["field_name"])
        if c["snapshot_date"] > b["last_change_date"]:
            b["last_change_date"] = c["snapshot_date"]

    item_ids = list(by_item.keys())
    today_iso = today.isoformat()
    snaps_res = (
        sb.table("products_snapshot")
        .select("ml_item_id,title,seller_sku,thumbnail,price,available_quantity,sold_quantity,status,snapshot_date")
        .in_("ml_item_id", item_ids)
        .order("snapshot_date", desc=True)
        .execute()
    ).data or []
    snap_by_item: dict[str, dict] = {}
    for s in snaps_res:
        snap_by_item.setdefault(s["ml_item_id"], s)

    out = []
    for iid, info in by_item.items():
        snap = snap_by_item.get(iid, {})
        out.append({
            "ml_item_id": iid,
            "account_id": info["account_id"],
            "title": snap.get("title"),
            "seller_sku": snap.get("seller_sku"),
            "thumbnail": snap.get("thumbnail"),
            "price": snap.get("price"),
            "available_quantity": snap.get("available_quantity"),
            "sold_quantity": snap.get("sold_quantity"),
            "status": snap.get("status"),
            "changes_count": info["changes_count"],
            "fields_changed": sorted(info["fields_changed"]),
            "last_change_date": info["last_change_date"],
        })
    out.sort(key=lambda r: (r["last_change_date"], r["changes_count"]), reverse=True)
    return {"start": start.isoformat(), "end": end.isoformat(), "items": out[:limit]}


@router.get("/{ml_item_id}")
def product_detail(ml_item_id: str):
    sb = supabase()
    last = (
        sb.table("products_snapshot")
        .select("*")
        .eq("ml_item_id", ml_item_id)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
    ).data
    if not last:
        raise HTTPException(404, "product not found")
    return last[0]


@router.get("/{ml_item_id}/changes")
def product_changes(
    ml_item_id: str,
    range: Literal["week", "month", "custom"] = "week",
    start: date | None = None,
    end: date | None = None,
):
    sb = supabase()
    if range == "custom":
        if not start or not end:
            raise HTTPException(400, "start and end required for custom range")
        s, e = start, end
    elif range == "month":
        today = today_cdmx()
        s = today.replace(day=1)
        e = today
    else:
        today = today_cdmx()
        s = _iso_monday(today)
        e = s + timedelta(days=6)

    rows = (
        sb.table("product_changes")
        .select("*")
        .eq("ml_item_id", ml_item_id)
        .gte("snapshot_date", s.isoformat())
        .lte("snapshot_date", e.isoformat())
        .order("snapshot_date", desc=True)
        .execute()
    ).data or []
    return {"start": s.isoformat(), "end": e.isoformat(), "changes": rows}


@router.get("/{ml_item_id}/competition-cache")
def get_competition_cache(ml_item_id: str):
    """Devuelve el ultimo cache de competencia para este producto.
    Sin importar TTL (puede ser de hace dias). Si no hay cache, devuelve 404.
    Util para auto-cargar resultados anteriores sin disparar Apify.
    """
    cached = get_cached(ml_item_id, max_age_hours=None)
    if not cached:
        raise HTTPException(404, "no cache")
    items = cached.get("items") or []
    return {
        "keyword": cached["keyword"],
        "items": items[:25],
        "total": min(len(items), 25),
        "cached": True,
        "fetched_at": cached["fetched_at"],
    }


@router.post("/{ml_item_id}/compare-competition")
def compare_competition(ml_item_id: str, force: bool = False):
    sb = supabase()
    last = (
        sb.table("products_snapshot")
        .select("permalink,title,price")
        .eq("ml_item_id", ml_item_id)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
    ).data
    if not last:
        raise HTTPException(404, "Product not found")
    p = last[0]
    try:
        return fetch_competition(ml_item_id, p.get("permalink"), p.get("title"), force=force)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Apify error: {e}")


@router.get("/{ml_item_id}/sales")
def product_sales(ml_item_id: str, days: int = 30):
    sb = supabase()
    today = today_cdmx()
    since = today - timedelta(days=days)
    since_iso, today_excl_iso = cdmx_day_to_utc_range(since, today)
    rows = (
        sb.table("sales")
        .select("*")
        .eq("ml_item_id", ml_item_id)
        .gte("sold_at", since_iso)
        .lt("sold_at", today_excl_iso)
        .neq("status", "cancelled")
        .order("sold_at", desc=True)
        .execute()
    ).data or []
    total = sum(float(r["total_amount"] or 0) for r in rows)
    units = sum(int(r["quantity"] or 0) for r in rows)
    return {"items": rows, "total": total, "units": units}
