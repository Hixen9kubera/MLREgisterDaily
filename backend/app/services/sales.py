from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.supabase_client import supabase
from app.services.ml_api import MLClient


def _flatten_order(account_id: str, order: dict) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sold_at = order.get("date_closed") or order.get("date_created")
    for it in order.get("order_items", []) or []:
        item = it.get("item", {}) or {}
        qty = int(it.get("quantity") or 0)
        unit = float(it.get("unit_price") or 0)
        rows.append(
            {
                "account_id": account_id,
                "ml_order_id": int(order["id"]),
                "ml_item_id": str(item.get("id") or ""),
                "title": item.get("title"),
                "quantity": qty,
                "unit_price": unit,
                "total_amount": qty * unit,
                "currency_id": it.get("currency_id") or order.get("currency_id"),
                "status": order.get("status"),
                "sold_at": sold_at,
                "buyer_id": (order.get("buyer") or {}).get("id"),
                "raw": order,
            }
        )
    return rows


def sync_sales(client: MLClient, account_id: str, since_days: int = 7) -> int:
    sb = supabase()
    since = datetime.now(timezone.utc) - timedelta(days=since_days)
    orders = client.list_orders_since(since)

    rows: list[dict] = []
    for o in orders:
        rows.extend(_flatten_order(account_id, o))

    if not rows:
        return 0

    for i in range(0, len(rows), 500):
        sb.table("sales").upsert(
            rows[i : i + 500],
            on_conflict="account_id,ml_order_id,ml_item_id",
        ).execute()
    return len(rows)
