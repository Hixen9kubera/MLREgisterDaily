from datetime import date, datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter

from app.db.supabase_client import supabase, retry_on_transient
from app.routes.goals import _iso_monday

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _resolve_range(date_from: date | None, date_to: date | None) -> tuple[date, date, bool]:
    """Returns (start, end_inclusive, is_current_week)."""
    if date_from and date_to:
        return date_from, date_to, False
    today = date.today()
    monday = _iso_monday(today)
    sunday = monday + timedelta(days=6)
    return monday, sunday, True


@router.get("/summary")
@retry_on_transient
def summary(
    account_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    sb = supabase()
    start, end, is_current_week = _resolve_range(date_from, date_to)
    end_exclusive = end + timedelta(days=1)

    goal = None
    if account_id and is_current_week:
        g = (
            sb.table("goals")
            .select("*")
            .eq("week_start", start.isoformat())
            .eq("account_id", account_id)
            .execute()
        )
        goal = g.data[0] if g.data else None

    sales_q = (
        sb.table("sales")
        .select("account_id,total_amount,sold_at,quantity")
        .gte("sold_at", start.isoformat())
        .lt("sold_at", end_exclusive.isoformat())
    )
    if account_id:
        sales_q = sales_q.eq("account_id", account_id)
    sales = (sales_q.execute()).data or []

    total = 0.0
    units = 0
    for s in sales:
        total += float(s["total_amount"] or 0)
        units += int(s.get("quantity") or 0)

    target = float(goal["target_amount"]) if goal else 0.0
    progress = (total / target) if target else 0.0

    # Período anterior del mismo tamaño
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    prev_end_exclusive = prev_end + timedelta(days=1)
    prev_q = (
        sb.table("sales")
        .select("total_amount,quantity")
        .gte("sold_at", prev_start.isoformat())
        .lt("sold_at", prev_end_exclusive.isoformat())
    )
    if account_id:
        prev_q = prev_q.eq("account_id", account_id)
    prev_rows = (prev_q.execute()).data or []
    prev_total = sum(float(r["total_amount"] or 0) for r in prev_rows)
    prev_units = sum(int(r.get("quantity") or 0) for r in prev_rows)
    delta_pct = ((total - prev_total) / prev_total) if prev_total else None

    last_run = (
        sb.table("cron_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    ).data
    last_run = last_run[0] if last_run else None

    return {
        "account_id": account_id,
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "is_current_week": is_current_week,
        "today": date.today().isoformat(),
        "goal": goal,
        "total": total,
        "units": units,
        "progress": progress,
        "prev_total": prev_total,
        "prev_units": prev_units,
        "prev_range_start": prev_start.isoformat(),
        "prev_range_end": prev_end.isoformat(),
        "delta_pct": delta_pct,
        "last_run": last_run,
    }


@router.get("/sales-by-day")
@retry_on_transient
def sales_by_day(
    account_id: str | None = None,
    days: int = 14,
    date_from: date | None = None,
    date_to: date | None = None,
):
    sb = supabase()
    if date_from and date_to:
        start, end = date_from, date_to
    else:
        end = date.today()
        start = end - timedelta(days=days - 1)
    end_exclusive = end + timedelta(days=1)

    q = (
        sb.table("sales")
        .select("sold_at,total_amount,account_id,quantity")
        .gte("sold_at", start.isoformat())
        .lt("sold_at", end_exclusive.isoformat())
    )
    if account_id:
        q = q.eq("account_id", account_id)
    rows = (q.execute()).data or []

    bucket: dict[str, dict] = {}
    cursor = start
    while cursor <= end:
        bucket[cursor.isoformat()] = {"total": 0.0, "units": 0}
        cursor += timedelta(days=1)

    for r in rows:
        d = (r["sold_at"] or "")[:10]
        if not d or d not in bucket:
            continue
        bucket[d]["total"] += float(r["total_amount"] or 0)
        bucket[d]["units"] += int(r.get("quantity") or 0)

    return [{"date": k, **v} for k, v in sorted(bucket.items())]


@router.get("/top-days")
def top_days(
    account_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    days: int = 30,
    limit: int = 7,
):
    series = sales_by_day(account_id=account_id, days=days, date_from=date_from, date_to=date_to)
    ranked = sorted(series, key=lambda r: r["total"], reverse=True)[:limit]
    return ranked


def _enrich_products(sb, ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    snaps = (
        sb.table("products_snapshot")
        .select("ml_item_id,title,seller_sku,thumbnail,permalink,price,available_quantity,status,snapshot_date")
        .in_("ml_item_id", ids)
        .order("snapshot_date", desc=True)
        .execute()
    ).data or []
    info: dict[str, dict] = {}
    for s in snaps:
        info.setdefault(s["ml_item_id"], s)
    return info


@router.get("/top-products")
@retry_on_transient
def top_products(
    metric: Literal["revenue", "units", "ticket", "stock_value"] = "revenue",
    account_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 10,
):
    sb = supabase()

    if metric == "stock_value":
        today_iso = date.today().isoformat()
        q = (
            sb.table("products_snapshot")
            .select("ml_item_id,title,seller_sku,thumbnail,permalink,price,available_quantity,status")
            .eq("snapshot_date", today_iso)
        )
        if account_id:
            q = q.eq("account_id", account_id)
        rows = (q.execute()).data or []
        for r in rows:
            price = float(r.get("price") or 0)
            stock = int(r.get("available_quantity") or 0)
            r["potential_revenue"] = price * stock
            r["current_price"] = price
            r["current_stock"] = stock
        rows.sort(key=lambda r: r["potential_revenue"], reverse=True)
        return rows[:limit]

    start, end, _ = _resolve_range(date_from, date_to)
    end_exclusive = end + timedelta(days=1)
    q = (
        sb.table("sales")
        .select("ml_item_id,total_amount,quantity,title")
        .gte("sold_at", start.isoformat())
        .lt("sold_at", end_exclusive.isoformat())
    )
    if account_id:
        q = q.eq("account_id", account_id)
    sales = (q.execute()).data or []

    agg: dict[str, dict] = {}
    for s in sales:
        iid = s.get("ml_item_id") or ""
        if not iid:
            continue
        a = agg.setdefault(iid, {"ml_item_id": iid, "revenue": 0.0, "units": 0, "title_from_sale": s.get("title")})
        a["revenue"] += float(s.get("total_amount") or 0)
        a["units"] += int(s.get("quantity") or 0)
    for a in agg.values():
        a["ticket"] = (a["revenue"] / a["units"]) if a["units"] else 0.0

    if metric == "revenue":
        items = sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)
    elif metric == "units":
        items = sorted(agg.values(), key=lambda r: r["units"], reverse=True)
    else:
        items = sorted(agg.values(), key=lambda r: r["ticket"], reverse=True)
    items = items[:limit]

    info = _enrich_products(sb, [i["ml_item_id"] for i in items])
    for i in items:
        d = info.get(i["ml_item_id"], {})
        i["title"] = d.get("title") or i.pop("title_from_sale", None)
        i["seller_sku"] = d.get("seller_sku")
        i["thumbnail"] = d.get("thumbnail")
        i["permalink"] = d.get("permalink")
        i["current_price"] = d.get("price")
        i["current_stock"] = d.get("available_quantity")
        i["status"] = d.get("status")
        i.pop("title_from_sale", None)
    return items


def _fetch_all_snapshot_today(sb, account_id: str | None) -> list[dict]:
    today_iso = date.today().isoformat()
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = (
            sb.table("products_snapshot")
            .select("ml_item_id,title,seller_sku,thumbnail,permalink,price,available_quantity,status,start_time")
            .eq("snapshot_date", today_iso)
        )
        if account_id:
            q = q.eq("account_id", account_id)
        chunk = (q.range(offset, offset + page_size - 1).execute()).data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


@router.get("/inventory-summary")
@retry_on_transient
def inventory_summary(account_id: str | None = None):
    sb = supabase()
    rows = _fetch_all_snapshot_today(sb, account_id)
    by_status: dict[str, dict] = {}
    for r in rows:
        st = r.get("status") or "unknown"
        b = by_status.setdefault(st, {"status": st, "products": 0, "units": 0, "value": 0.0})
        b["products"] += 1
        qty = int(r.get("available_quantity") or 0)
        price = float(r.get("price") or 0)
        b["units"] += qty
        b["value"] += qty * price
    return {
        "total_products": len(rows),
        "by_status": sorted(by_status.values(), key=lambda x: x["value"], reverse=True),
    }


@router.get("/low-stock")
@retry_on_transient
def low_stock(
    account_id: str | None = None,
    threshold: int = 10,
    only_active: bool = True,
    limit: int = 100,
):
    sb = supabase()
    today_iso = date.today().isoformat()
    q = (
        sb.table("products_snapshot")
        .select("ml_item_id,title,seller_sku,thumbnail,permalink,price,available_quantity,sold_quantity,status,account_id")
        .eq("snapshot_date", today_iso)
        .lt("available_quantity", threshold)
    )
    if account_id:
        q = q.eq("account_id", account_id)
    if only_active:
        q = q.eq("status", "active")
    rows = (q.order("available_quantity").limit(limit).execute()).data or []
    return rows


@router.get("/inactive-products")
@retry_on_transient
def inactive_products(
    account_id: str | None = None,
    days: int = 30,
    only_active_listings: bool = True,
    only_with_recent_changes: bool = False,
    limit: int = 50,
):
    sb = supabase()
    today = date.today()
    since = today - timedelta(days=days)
    since_excl = today + timedelta(days=1)

    sold_ids: set[str] = set()
    sales_q = (
        sb.table("sales")
        .select("ml_item_id")
        .gte("sold_at", since.isoformat())
        .lt("sold_at", since_excl.isoformat())
    )
    if account_id:
        sales_q = sales_q.eq("account_id", account_id)
    page_size = 1000
    offset = 0
    while True:
        chunk = (sales_q.range(offset, offset + page_size - 1).execute()).data or []
        for s in chunk:
            iid = s.get("ml_item_id")
            if iid:
                sold_ids.add(iid)
        if len(chunk) < page_size:
            break
        offset += page_size

    snap_rows = _fetch_all_snapshot_today(sb, account_id)
    if only_active_listings:
        snap_rows = [r for r in snap_rows if r.get("status") == "active"]
    without_sales = [r for r in snap_rows if r["ml_item_id"] not in sold_ids]

    changes_q = (
        sb.table("product_changes")
        .select("ml_item_id,field_name,snapshot_date")
        .gte("snapshot_date", (today - timedelta(days=7)).isoformat())
    )
    if account_id:
        changes_q = changes_q.eq("account_id", account_id)
    changes_rows: list[dict] = []
    offset = 0
    while True:
        chunk = (changes_q.range(offset, offset + page_size - 1).execute()).data or []
        changes_rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size

    changes_by_item: dict[str, dict] = {}
    BUSINESS_FIELDS = {"price", "original_price", "available_quantity", "title", "thumbnail", "free_shipping", "listing_type_id"}
    for c in changes_rows:
        b = changes_by_item.setdefault(c["ml_item_id"], {"count": 0, "fields": set(), "last": None})
        b["count"] += 1
        b["fields"].add(c["field_name"])
        if not b["last"] or c["snapshot_date"] > b["last"]:
            b["last"] = c["snapshot_date"]

    out = []
    for r in without_sales:
        info = changes_by_item.get(r["ml_item_id"], {"count": 0, "fields": set(), "last": None})
        if only_with_recent_changes and info["count"] == 0:
            continue
        biz_changes = sorted(info["fields"] & BUSINESS_FIELDS)
        price = float(r.get("price") or 0)
        stock = int(r.get("available_quantity") or 0)
        out.append({
            **r,
            "potential_revenue": price * stock,
            "changes_7d": info["count"],
            "business_changes_7d": biz_changes,
            "last_change_date": info["last"],
        })

    out.sort(key=lambda r: (r["changes_7d"], r["potential_revenue"]), reverse=True)
    total = len(out)
    total_lost_value = sum(r["potential_revenue"] for r in out)
    return {
        "days": days,
        "total_inactive": total,
        "total_potential_revenue": total_lost_value,
        "items": out[:limit],
    }


@router.get("/top-views")
@retry_on_transient
def top_views(
    account_id: str | None = None,
    window: Literal["1d", "7d", "30d"] = "30d",
    limit: int = 10,
):
    sb = supabase()
    today_iso = date.today().isoformat()
    col = {"1d": "visits_1d", "7d": "visits_7d", "30d": "visits_30d"}[window]
    q = (
        sb.table("products_snapshot")
        .select(f"ml_item_id,title,seller_sku,thumbnail,permalink,price,available_quantity,sold_quantity,status,{col}")
        .eq("snapshot_date", today_iso)
        .not_.is_(col, "null")
    )
    if account_id:
        q = q.eq("account_id", account_id)
    rows = (q.order(col, desc=True).limit(limit).execute()).data or []
    return [{**r, "visits": r.get(col)} for r in rows]


@router.get("/aged-products")
@retry_on_transient
def aged_products(
    account_id: str | None = None,
    min_age_days: int = 180,
    no_sales_days: int = 60,
    only_active: bool = True,
    limit: int = 50,
):
    sb = supabase()
    today = date.today()
    age_cutoff = (datetime.now(timezone.utc) - timedelta(days=min_age_days)).isoformat()
    sales_since = today - timedelta(days=no_sales_days)
    sales_since_excl = today + timedelta(days=1)

    sold_ids: set[str] = set()
    sales_q = (
        sb.table("sales")
        .select("ml_item_id")
        .gte("sold_at", sales_since.isoformat())
        .lt("sold_at", sales_since_excl.isoformat())
    )
    if account_id:
        sales_q = sales_q.eq("account_id", account_id)
    page_size = 1000
    offset = 0
    while True:
        chunk = (sales_q.range(offset, offset + page_size - 1).execute()).data or []
        for s in chunk:
            iid = s.get("ml_item_id")
            if iid:
                sold_ids.add(iid)
        if len(chunk) < page_size:
            break
        offset += page_size

    snap_rows = _fetch_all_snapshot_today(sb, account_id)
    if only_active:
        snap_rows = [r for r in snap_rows if r.get("status") == "active"]
    snap_rows = [r for r in snap_rows if r.get("start_time") and r["start_time"] < age_cutoff]
    aged = [r for r in snap_rows if r["ml_item_id"] not in sold_ids]

    for r in aged:
        price = float(r.get("price") or 0)
        stock = int(r.get("available_quantity") or 0)
        r["potential_revenue"] = price * stock
    aged.sort(key=lambda r: r["potential_revenue"], reverse=True)
    return {
        "min_age_days": min_age_days,
        "no_sales_days": no_sales_days,
        "total": len(aged),
        "items": aged[:limit],
    }
