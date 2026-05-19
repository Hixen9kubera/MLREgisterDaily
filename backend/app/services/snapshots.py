from datetime import date, datetime, timezone
import json
from typing import Any

from app.db.supabase_client import supabase
from app.services.ml_api import MLClient
from app.utils.tz import today_cdmx


SCALAR_TRACKED_FIELDS = [
    "title",
    "price",
    "original_price",
    "available_quantity",
    "sold_quantity",
    "status",
    "listing_type_id",
    "condition",
    "permalink",
    "thumbnail",
    "category_id",
    "health",
    "inventory_id",
    "family_id",
    "domain_id",
    "accepts_mercadopago",
    "free_shipping",
    "shipping_mode",
    "pictures_count",
    "variations_count",
    "last_updated",
    "start_time",
    "stop_time",
    "warranty",
    "seller_sku",
    "visits_30d",
    "visits_7d",
    "visits_1d",
]

JSON_TRACKED_FIELDS = [
    "sub_status",
    "tags",
    "attributes_map",
]

VARIATION_TRACKED_FIELDS = [
    "price",
    "available_quantity",
    "sold_quantity",
]


SELECT_COLS = ",".join(["ml_item_id", *SCALAR_TRACKED_FIELDS, *JSON_TRACKED_FIELDS, "variations"])


def _extract_sku(item: dict) -> str | None:
    for a in item.get("attributes") or []:
        if a.get("id") == "SELLER_SKU":
            v = a.get("value_name") or a.get("value_id")
            if v:
                return str(v)
    v = item.get("seller_custom_field")
    return str(v) if v else None


def _attributes_map(item: dict) -> dict:
    out: dict[str, Any] = {}
    for a in item.get("attributes") or []:
        aid = a.get("id")
        val = a.get("value_name") or a.get("value_id")
        if aid and val is not None:
            out[str(aid)] = val
    return out


def _row_from_item(account_id: str, snap_date: date, item: dict) -> dict[str, Any]:
    shipping = item.get("shipping") or {}
    return {
        "account_id": account_id,
        "ml_item_id": item["id"],
        "snapshot_date": snap_date.isoformat(),
        "seller_sku": _extract_sku(item),
        "title": item.get("title"),
        "price": item.get("price"),
        "original_price": item.get("original_price"),
        "available_quantity": item.get("available_quantity"),
        "sold_quantity": item.get("sold_quantity"),
        "status": item.get("status"),
        "listing_type_id": item.get("listing_type_id"),
        "condition": item.get("condition"),
        "permalink": item.get("permalink"),
        "thumbnail": item.get("thumbnail"),
        "category_id": item.get("category_id"),
        "health": item.get("health"),
        "inventory_id": item.get("inventory_id"),
        "family_id": item.get("family_id"),
        "domain_id": item.get("domain_id"),
        "sub_status": item.get("sub_status"),
        "tags": item.get("tags"),
        "attributes_map": _attributes_map(item),
        "accepts_mercadopago": item.get("accepts_mercadopago"),
        "free_shipping": shipping.get("free_shipping"),
        "shipping_mode": shipping.get("mode"),
        "pictures_count": len(item.get("pictures") or []),
        "variations_count": len(item.get("variations") or []),
        "variations": item.get("variations"),
        "last_updated": item.get("last_updated"),
        "start_time": item.get("start_time"),
        "stop_time": item.get("stop_time"),
        "warranty": item.get("warranty"),
        "raw": item,
    }


def ensure_account(ml_user_id: int, nickname: str) -> str:
    sb = supabase()
    res = sb.table("ml_accounts").select("id,nickname").eq("ml_user_id", ml_user_id).execute()
    if res.data:
        row = res.data[0]
        if row.get("nickname") != nickname:
            sb.table("ml_accounts").update({"nickname": nickname}).eq("id", row["id"]).execute()
        return row["id"]
    ins = (
        sb.table("ml_accounts")
        .insert({"ml_user_id": ml_user_id, "nickname": nickname})
        .execute()
    )
    return ins.data[0]["id"]


def take_snapshot(client: MLClient, account_id: str, snap_date: date | None = None) -> dict:
    snap_date = snap_date or today_cdmx()
    sb = supabase()

    ids = list(client.iter_item_ids())
    items = client.get_items_multi(ids)
    item_ids = [it["id"] for it in items if it.get("id")]

    def _safe_visits(days: int) -> dict[str, int]:
        if not item_ids:
            return {}
        try:
            return client.items_visits_total(item_ids, days=days)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"items_visits_total({days}d) fallo global: {e}")
            return {}
    visits_30 = _safe_visits(30)
    visits_7 = _safe_visits(7)
    visits_1 = _safe_visits(1)

    rows: list[dict] = []
    for it in items:
        row = _row_from_item(account_id, snap_date, it)
        row["visits_30d"] = visits_30.get(it.get("id"))
        row["visits_7d"] = visits_7.get(it.get("id"))
        row["visits_1d"] = visits_1.get(it.get("id"))
        rows.append(row)

    if rows:
        for i in range(0, len(rows), 500):
            sb.table("products_snapshot").upsert(
                rows[i : i + 500],
                on_conflict="account_id,ml_item_id,snapshot_date",
            ).execute()

    changes = _detect_changes(account_id, snap_date)
    return {"account_id": account_id, "items": len(rows), "changes": changes}


def _detect_changes(account_id: str, snap_date: date) -> int:
    sb = supabase()
    today_rows = (
        sb.table("products_snapshot")
        .select(SELECT_COLS)
        .eq("account_id", account_id)
        .eq("snapshot_date", snap_date.isoformat())
        .execute()
    ).data or []
    if not today_rows:
        return 0

    yest_rows = (
        sb.table("products_snapshot")
        .select(SELECT_COLS + ",snapshot_date")
        .eq("account_id", account_id)
        .lt("snapshot_date", snap_date.isoformat())
        .order("snapshot_date", desc=True)
        .execute()
    ).data or []

    last_by_item: dict[str, dict] = {}
    for r in yest_rows:
        if r["ml_item_id"] not in last_by_item:
            last_by_item[r["ml_item_id"]] = r

    diffs: list[dict] = []
    for cur in today_rows:
        prev = last_by_item.get(cur["ml_item_id"])
        if not prev:
            continue
        iid = cur["ml_item_id"]
        for f in SCALAR_TRACKED_FIELDS:
            if _norm_scalar(prev.get(f)) != _norm_scalar(cur.get(f)):
                diffs.append(_diff_row(account_id, iid, snap_date, f, prev.get(f), cur.get(f)))
        diffs.extend(_map_diffs(account_id, iid, snap_date, "attributes", prev.get("attributes_map"), cur.get("attributes_map")))
        diffs.extend(_list_diffs(account_id, iid, snap_date, "tags", prev.get("tags"), cur.get("tags")))
        diffs.extend(_list_diffs(account_id, iid, snap_date, "sub_status", prev.get("sub_status"), cur.get("sub_status")))
        diffs.extend(_variation_diffs(account_id, iid, snap_date, prev.get("variations"), cur.get("variations")))

    if diffs:
        for i in range(0, len(diffs), 500):
            sb.table("product_changes").upsert(
                diffs[i : i + 500],
                on_conflict="account_id,ml_item_id,snapshot_date,field_name",
            ).execute()
    return len(diffs)


def _map_diffs(account_id: str, ml_item_id: str, snap_date: date, prefix: str, prev_map, cur_map) -> list[dict]:
    p = prev_map if isinstance(prev_map, dict) else {}
    c = cur_map if isinstance(cur_map, dict) else {}
    out: list[dict] = []
    for k in set(p.keys()) | set(c.keys()):
        a, b = p.get(k), c.get(k)
        if a != b:
            out.append(_diff_row(account_id, ml_item_id, snap_date, f"{prefix}.{k}", a, b))
    return out


def _list_diffs(account_id: str, ml_item_id: str, snap_date: date, prefix: str, prev_list, cur_list) -> list[dict]:
    p = set(prev_list or [])
    c = set(cur_list or [])
    added = sorted(c - p)
    removed = sorted(p - c)
    out: list[dict] = []
    if added:
        out.append(_diff_row(account_id, ml_item_id, snap_date, f"{prefix}.added", None, ", ".join(map(str, added))))
    if removed:
        out.append(_diff_row(account_id, ml_item_id, snap_date, f"{prefix}.removed", ", ".join(map(str, removed)), None))
    return out


def _variation_diffs(account_id: str, ml_item_id: str, snap_date: date, prev_vars, cur_vars) -> list[dict]:
    prev_by_id = {str(v.get("id")): v for v in (prev_vars or []) if v.get("id") is not None}
    cur_by_id = {str(v.get("id")): v for v in (cur_vars or []) if v.get("id") is not None}
    out: list[dict] = []
    for vid in prev_by_id.keys() | cur_by_id.keys():
        prev = prev_by_id.get(vid, {})
        cur = cur_by_id.get(vid, {})
        if not prev:
            out.append(_diff_row(account_id, ml_item_id, snap_date, f"variations[{vid}]", None, "added"))
            continue
        if not cur:
            out.append(_diff_row(account_id, ml_item_id, snap_date, f"variations[{vid}]", "removed", None))
            continue
        for f in VARIATION_TRACKED_FIELDS:
            if _norm_scalar(prev.get(f)) != _norm_scalar(cur.get(f)):
                out.append(_diff_row(account_id, ml_item_id, snap_date, f"variations[{vid}].{f}", prev.get(f), cur.get(f)))
    return out


def _diff_row(account_id: str, ml_item_id: str, snap_date: date, field: str, old, new) -> dict:
    return {
        "account_id": account_id,
        "ml_item_id": ml_item_id,
        "snapshot_date": snap_date.isoformat(),
        "field_name": field,
        "old_value": _to_str(old),
        "new_value": _to_str(new),
    }


def _norm_scalar(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _canon_json(v) -> str:
    if v is None:
        return "null"
    return json.dumps(v, sort_keys=True, default=str)


def _to_str(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, default=str)[:2000]
    return str(v)
