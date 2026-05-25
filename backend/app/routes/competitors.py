from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.competitor_monitor import (
    list_watched,
    list_diary,
    list_monthly_reports,
    unwatch_competitor,
    watch_competitor,
    run_competitor_monitoring_job,
)

router = APIRouter(prefix="/competitors", tags=["competitors"])


class WatchIn(BaseModel):
    our_ml_item_id: str
    competitor_ml_id: str
    title: str | None = None
    url: str | None = None
    thumbnail: str | None = None
    seller: str | None = None
    brand: str | None = None
    price: float | None = None


@router.post("/watch")
def add_watch(payload: WatchIn):
    return watch_competitor(
        our_ml_item_id=payload.our_ml_item_id,
        competitor_ml_id=payload.competitor_ml_id,
        title=payload.title,
        url=payload.url,
        thumbnail=payload.thumbnail,
        seller=payload.seller,
        brand=payload.brand,
        price=payload.price,
    )


@router.delete("/watch")
def remove_watch(our_ml_item_id: str, competitor_ml_id: str, hard: bool = False):
    unwatch_competitor(our_ml_item_id, competitor_ml_id, hard_delete=hard)
    return {"ok": True}


@router.get("/watched")
def get_watched(our_ml_item_id: str | None = None, only_active: bool = True):
    return list_watched(our_ml_item_id=our_ml_item_id, only_active=only_active)


@router.get("/{watchlist_id}/history")
def get_history(watchlist_id: int, limit: int = 50):
    return list_diary(watchlist_id, limit=limit)


@router.get("/{watchlist_id}/monthly")
def get_monthly(watchlist_id: int):
    return list_monthly_reports(watchlist_id)


@router.post("/run-monitoring")
def run_now():
    """Disparar el job manualmente (testing)."""
    try:
        return run_competitor_monitoring_job()
    except Exception as e:
        raise HTTPException(500, f"job error: {e}")
