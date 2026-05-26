"""Archive de ventas para evitar saturar la BD.

Reglas:
  - Diariamente se acumulan ventas en la tabla `sales`.
  - Al INICIO de cada semana ISO (lunes 8 AM CDMX) se archiva la semana
    inmediata anterior (lun-dom) en `sales_weekly_archive` y se borran las
    filas individuales de esa semana de `sales`.
  - Al INICIO de cada mes (dia 1, 8 AM CDMX) se archiva el mes anterior
    completo en `sales_monthly_archive` (resumen agregado).
  - Persistencia garantizada: las ULTIMAS 4 SEMANAS Mon-Sun siempre estan
    presentes en `sales` (no se archivan).
"""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import logging

from app.db.supabase_client import supabase
from app.utils.tz import today_cdmx, cdmx_day_to_utc_range

logger = logging.getLogger(__name__)

WEEKS_TO_KEEP_IN_HOT_TABLE = 4


def _iso_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_isoinfo(week_start: date) -> tuple[int, int]:
    iso_year, iso_week, _ = week_start.isocalendar()
    return iso_year, iso_week


def _aggregate_week(account_id: str, week_start: date, week_end: date) -> dict:
    """Suma ventas de la semana en categorias gross / net / cancelled / abandonos."""
    sb = supabase()
    start_iso, end_iso = cdmx_day_to_utc_range(week_start, week_end)

    rows: list[dict] = []
    offset = 0
    page = 1000
    while True:
        q = (
            sb.table("sales")
            .select("ml_order_id,quantity,total_amount,sold_at,status,paid_amount")
            .gte("sold_at", start_iso)
            .lt("sold_at", end_iso)
            .eq("account_id", account_id)
        )
        chunk = (q.range(offset, offset + page - 1).execute()).data or []
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += page

    daily: dict[str, dict] = defaultdict(lambda: {"orders": set(), "units": 0, "gross": 0.0, "net": 0.0, "cancelled": 0.0, "cancelled_orders": set()})
    gross_orders, net_orders, cancelled_orders = set(), set(), set()
    gross_total = net_total = cancelled_total = 0.0
    units = 0

    from datetime import datetime as dt
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Mexico_City")

    for r in rows:
        sold = dt.fromisoformat(r["sold_at"].replace("Z", "+00:00")).astimezone(TZ)
        day = sold.date().isoformat()
        amt = float(r.get("total_amount") or 0)
        qty = int(r.get("quantity") or 0)
        oid = r.get("ml_order_id")
        status = r.get("status")
        paid = float(r.get("paid_amount") or 0)

        is_cancelled = status == "cancelled"
        is_abandoned = is_cancelled and paid <= 0

        if is_abandoned:
            continue

        daily[day]["gross"] += amt
        daily[day]["units"] += qty
        gross_total += amt
        units += qty
        if oid is not None:
            daily[day]["orders"].add(oid)
            gross_orders.add(oid)

        if is_cancelled:
            daily[day]["cancelled"] += amt
            cancelled_total += amt
            if oid is not None:
                daily[day]["cancelled_orders"].add(oid)
                cancelled_orders.add(oid)
        else:
            daily[day]["net"] += amt
            net_total += amt
            if oid is not None:
                net_orders.add(oid)

    breakdown = []
    cur = week_start
    while cur <= week_end:
        iso = cur.isoformat()
        d = daily.get(iso, {})
        breakdown.append({
            "date": iso,
            "orders": len(d.get("orders", set())),
            "units": d.get("units", 0),
            "gross": round(d.get("gross", 0.0), 2),
            "net": round(d.get("net", 0.0), 2),
            "cancelled": round(d.get("cancelled", 0.0), 2),
        })
        cur += timedelta(days=1)

    return {
        "orders_count": len(gross_orders),
        "units": units,
        "gross_total": round(gross_total, 2),
        "net_total": round(net_total, 2),
        "cancelled_total": round(cancelled_total, 2),
        "cancelled_orders": len(cancelled_orders),
        "daily_breakdown": breakdown,
    }


def _archive_week(account_id: str, week_start: date) -> dict:
    """Archiva una semana Mon-Sun en sales_weekly_archive y borra esas filas de sales."""
    sb = supabase()
    week_end = week_start + timedelta(days=6)

    already = (
        sb.table("sales_weekly_archive")
        .select("id")
        .eq("account_id", account_id)
        .eq("week_start", week_start.isoformat())
        .execute()
    ).data
    if already:
        return {"skipped": True, "reason": "already archived"}

    agg = _aggregate_week(account_id, week_start, week_end)
    if not agg["orders_count"] and not agg["cancelled_orders"]:
        return {"skipped": True, "reason": "no sales"}

    iso_year, iso_week = _week_isoinfo(week_start)
    sb.table("sales_weekly_archive").insert({
        "account_id": account_id,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "iso_year": iso_year,
        "iso_week": iso_week,
        **agg,
    }).execute()

    start_iso, end_iso = cdmx_day_to_utc_range(week_start, week_end)
    sb.table("sales").delete().eq("account_id", account_id).gte("sold_at", start_iso).lt("sold_at", end_iso).execute()
    return {"archived": True, "orders": agg["orders_count"], "gross": agg["gross_total"]}


def _archive_month(account_id: str, year: int, month: int) -> dict:
    """Archiva un mes calendario en sales_monthly_archive, agregando las semanas archivadas."""
    sb = supabase()
    already = (
        sb.table("sales_monthly_archive")
        .select("id")
        .eq("account_id", account_id)
        .eq("period_year", year)
        .eq("period_month", month)
        .execute()
    ).data
    if already:
        return {"skipped": True, "reason": "already archived"}

    month_start = date(year, month, 1)
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    month_end = next_month - timedelta(days=1)

    weeks = (
        sb.table("sales_weekly_archive")
        .select("*")
        .eq("account_id", account_id)
        .gte("week_start", (month_start - timedelta(days=6)).isoformat())
        .lte("week_start", month_end.isoformat())
        .order("week_start")
        .execute()
    ).data or []
    contributing = [w for w in weeks if not (date.fromisoformat(w["week_end"]) < month_start or date.fromisoformat(w["week_start"]) > month_end)]
    if not contributing:
        return {"skipped": True, "reason": "no weekly data"}

    gross = sum(float(w["gross_total"] or 0) for w in contributing)
    net = sum(float(w["net_total"] or 0) for w in contributing)
    canc = sum(float(w["cancelled_total"] or 0) for w in contributing)
    orders = sum(int(w["orders_count"] or 0) for w in contributing)
    units = sum(int(w["units"] or 0) for w in contributing)
    cancelled_orders = sum(int(w["cancelled_orders"] or 0) for w in contributing)

    sb.table("sales_monthly_archive").insert({
        "account_id": account_id,
        "period_year": year,
        "period_month": month,
        "orders_count": orders,
        "units": units,
        "gross_total": round(gross, 2),
        "net_total": round(net, 2),
        "cancelled_total": round(canc, 2),
        "cancelled_orders": cancelled_orders,
        "weekly_breakdown": [{"week_start": w["week_start"], "week_end": w["week_end"], "gross": float(w["gross_total"] or 0), "net": float(w["net_total"] or 0)} for w in contributing],
    }).execute()
    return {"archived": True, "weeks": len(contributing), "gross": round(gross, 2)}


def run_sales_archive_job() -> dict:
    """Job diario que archiva semanas y meses cerrados, manteniendo 4 semanas en sales.

    - Cada lunes: archiva la semana ANTERIOR (Mon-Sun ya cerrada) y borra sus rows de sales.
    - Dia 1 de cada mes: archiva el mes ANTERIOR completo.
    """
    sb = supabase()
    today = today_cdmx()
    monday_this_week = _iso_monday(today)
    accounts = (sb.table("ml_accounts").select("id,nickname").execute()).data or []

    results = []

    # 1) Archivar semanas viejas (mas alla de las 4 ultimas)
    oldest_kept_monday = monday_this_week - timedelta(weeks=WEEKS_TO_KEEP_IN_HOT_TABLE)
    # Buscar la primera fecha de sales y archivar semanas hasta oldest_kept_monday - 1 dia
    for acc in accounts:
        oldest_row = (
            sb.table("sales")
            .select("sold_at")
            .eq("account_id", acc["id"])
            .order("sold_at")
            .limit(1)
            .execute()
        ).data
        if not oldest_row:
            continue
        from datetime import datetime as dt
        from zoneinfo import ZoneInfo
        TZ = ZoneInfo("America/Mexico_City")
        oldest_dt = dt.fromisoformat(oldest_row[0]["sold_at"].replace("Z", "+00:00")).astimezone(TZ).date()
        cursor = _iso_monday(oldest_dt)
        while cursor < oldest_kept_monday:
            res = _archive_week(acc["id"], cursor)
            results.append({"account": acc["nickname"], "week_start": cursor.isoformat(), **res})
            cursor += timedelta(weeks=1)

    # 2) Si HOY es dia 1, archivar el mes anterior
    if today.day == 1:
        last_month_end = today - timedelta(days=1)
        y, m = last_month_end.year, last_month_end.month
        for acc in accounts:
            res = _archive_month(acc["id"], y, m)
            results.append({"account": acc["nickname"], "month": f"{y}-{m:02d}", **res})

    return {
        "today": today.isoformat(),
        "weeks_to_keep_hot": WEEKS_TO_KEEP_IN_HOT_TABLE,
        "oldest_kept_monday": oldest_kept_monday.isoformat(),
        "operations": results,
    }
