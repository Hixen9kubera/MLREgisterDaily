import re
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import get_settings
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"
CACHE_TTL_HOURS = 6


def keyword_from_permalink(permalink: str | None, fallback_title: str | None = None) -> str:
    """Extrae el slug del permalink de ML y lo convierte a query.

    Ejemplo:
      https://www.mercadolibre.com.mx/escritorio-para-computadora-en-l-con-estantes/up/MLMU.../
      -> 'escritorio para computadora en l con estantes'
    """
    if permalink:
        m = re.search(r"mercadolibre\.com\.[a-z]+/([^/?]+)/", permalink)
        if m:
            slug = m.group(1)
            kw = slug.replace("-", " ").replace("_", " ").strip().lower()
            if kw:
                return kw
    if fallback_title:
        # Truncar y limpiar el titulo
        t = re.sub(r"[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]", " ", fallback_title).lower()
        t = re.sub(r"\s+", " ", t).strip()
        return " ".join(t.split()[:10])
    return ""


def get_cached(ml_item_id: str) -> dict | None:
    sb = supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=CACHE_TTL_HOURS)).isoformat()
    r = (
        sb.table("competition_cache")
        .select("*")
        .eq("ml_item_id", ml_item_id)
        .gte("fetched_at", cutoff)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return r.data[0] if r.data else None


def save_cache(ml_item_id: str, keyword: str, items: list[dict]) -> None:
    sb = supabase()
    sb.table("competition_cache").insert({
        "ml_item_id": ml_item_id,
        "keyword": keyword,
        "items": items,
    }).execute()


def call_apify(keyword: str, max_pages: int = 1) -> list[dict]:
    s = get_settings()
    if not s.APIFY_API_KEY:
        raise RuntimeError("APIFY_API_KEY no configurada")
    actor_id = s.APIFY_ML_ACTOR.replace("/", "~")
    url = f"{APIFY_BASE}/acts/{actor_id}/run-sync-get-dataset-items?token={s.APIFY_API_KEY}"
    payload = {
        "keyword": keyword,
        "country": "https://listado.mercadolibre.com.mx/",
        "maxPages": max_pages,
        "promoted": False,
    }
    logger.info(f"Apify: llamando actor con keyword='{keyword}'")
    with httpx.Client(timeout=300.0) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        items = r.json()
    logger.info(f"Apify: recibidos {len(items)} items para '{keyword}'")
    return items


def fetch_competition(ml_item_id: str, permalink: str | None, title: str | None, force: bool = False) -> dict:
    """Busca competencia en ML via Apify, usa cache de 6h por ml_item_id.
    Retorna {keyword, items, total, cached, fetched_at}.
    """
    if not force:
        cached = get_cached(ml_item_id)
        if cached:
            return {
                "keyword": cached["keyword"],
                "items": cached["items"][:25],
                "total": min(len(cached["items"]), 25),
                "cached": True,
                "fetched_at": cached["fetched_at"],
            }
    keyword = keyword_from_permalink(permalink, title)
    if not keyword:
        raise ValueError("No se pudo extraer keyword del producto")
    raw_items = call_apify(keyword, max_pages=1)
    save_cache(ml_item_id, keyword, raw_items)
    return {
        "keyword": keyword,
        "items": raw_items[:25],
        "total": min(len(raw_items), 25),
        "cached": False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
