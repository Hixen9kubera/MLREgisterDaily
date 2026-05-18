from fastapi import APIRouter
from app.db.supabase_client import supabase

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts():
    sb = supabase()
    return (sb.table("ml_accounts").select("*").order("nickname").execute()).data or []
