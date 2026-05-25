from fastapi import APIRouter

from app.db.supabase_client import supabase

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(unread_only: bool = False, limit: int = 30):
    sb = supabase()
    q = sb.table("notifications").select("*").order("created_at", desc=True).limit(limit)
    if unread_only:
        q = q.eq("is_read", False)
    return (q.execute()).data or []


@router.get("/unread-count")
def unread_count():
    sb = supabase()
    r = sb.table("notifications").select("id", count="exact").eq("is_read", False).execute()
    return {"count": r.count or 0}


@router.get("/grouped")
def grouped():
    """Notificaciones agrupadas por fecha (CDMX)."""
    sb = supabase()
    rows = (
        sb.table("notifications")
        .select("*")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    ).data or []
    by_date: dict[str, list] = {}
    for r in rows:
        d = r.get("created_date") or (r.get("created_at") or "")[:10]
        by_date.setdefault(d, []).append(r)
    groups = [
        {"date": d, "count": len(items), "unread": sum(1 for x in items if not x.get("is_read")), "items": items}
        for d, items in by_date.items()
    ]
    groups.sort(key=lambda g: g["date"], reverse=True)
    return groups


@router.post("/{notif_id}/mark-read")
def mark_read(notif_id: int):
    sb = supabase()
    sb.table("notifications").update({"is_read": True}).eq("id", notif_id).execute()
    return {"ok": True}


@router.post("/mark-all-read")
def mark_all_read():
    sb = supabase()
    sb.table("notifications").update({"is_read": True}).eq("is_read", False).execute()
    return {"ok": True}
