from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.services.jobs import run_daily_job

router = APIRouter(prefix="/cron", tags=["cron"])


@router.post("/snapshot")
def cron_snapshot(x_cron_secret: str = Header(default="")):
    if x_cron_secret != get_settings().CRON_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="invalid cron secret")
    return run_daily_job()
