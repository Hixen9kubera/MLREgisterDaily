from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.supabase_client import supabase
from app.config import get_settings
from app.utils.tz import today_cdmx

router = APIRouter(prefix="/goals", tags=["goals"])


def _iso_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


class GoalIn(BaseModel):
    account_id: str
    week_start: date | None = None
    target_amount: float = Field(gt=0)
    currency: str = "MXN"
    note: str | None = None


@router.get("/current")
def get_current_goal(account_id: str = Query(...)):
    today = today_cdmx()
    monday = _iso_monday(today)
    sb = supabase()
    r = (
        sb.table("goals")
        .select("*")
        .eq("week_start", monday.isoformat())
        .eq("account_id", account_id)
        .execute()
    )
    if r.data:
        return r.data[0]
    s = get_settings()
    ins = (
        sb.table("goals")
        .insert(
            {
                "week_start": monday.isoformat(),
                "account_id": account_id,
                "target_amount": s.DEFAULT_WEEKLY_GOAL_MXN,
                "currency": "MXN",
            }
        )
        .execute()
    )
    return ins.data[0]


@router.get("")
def list_goals(account_id: str | None = None, limit: int = 12):
    sb = supabase()
    q = sb.table("goals").select("*")
    if account_id:
        q = q.eq("account_id", account_id)
    r = q.order("week_start", desc=True).limit(limit).execute()
    return r.data or []


@router.put("/current")
def upsert_current_goal(payload: GoalIn):
    monday = _iso_monday(payload.week_start or today_cdmx())
    sb = supabase()
    existing = (
        sb.table("goals")
        .select("id")
        .eq("week_start", monday.isoformat())
        .eq("account_id", payload.account_id)
        .execute()
    ).data
    body = {
        "week_start": monday.isoformat(),
        "account_id": payload.account_id,
        "target_amount": payload.target_amount,
        "currency": payload.currency,
        "note": payload.note,
    }
    if existing:
        r = sb.table("goals").update(body).eq("id", existing[0]["id"]).execute()
    else:
        r = sb.table("goals").insert(body).execute()
    if not r.data:
        raise HTTPException(500, "no row returned")
    return r.data[0]
