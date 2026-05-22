import re
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import get_settings
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"
CACHE_TTL_HOURS = 6


SPANISH_COLORS = {
    "negro", "negra", "blanco", "blanca", "rojo", "roja", "azul", "verde",
    "amarillo", "amarilla", "gris", "beige", "marron", "marrón", "cafe", "café",
    "naranja", "morado", "morada", "purpura", "púrpura", "rosa", "rosado", "rosada",
    "plata", "plateado", "plateada", "oro", "dorado", "dorada", "mate", "brillante",
    "lila", "violeta", "turquesa", "celeste", "fucsia", "vino", "ocre", "crema",
    "natural", "transparente", "claro", "clara", "oscuro", "oscura", "mostaza",
    "menta", "coral", "salmon", "salmón", "neutro", "neutra", "champagne",
    "khaki", "khakhi", "tinto",
}


def keyword_from_permalink(permalink: str | None, fallback_title: str | None = None, max_words: int = 7) -> str:
    """Extrae el slug del permalink de ML y lo convierte a query de busqueda.

    Soporta formatos:
      - https://articulo.mercadolibre.com.mx/MLM2702502571-escritorio-para-...-negro-_JM
      - https://www.mercadolibre.com.mx/escritorio-para-.../up/MLMU.../
    Limpia: prefijo MLM###-, sufijo -_JM, colores al final, limita a max_words.
    """
    candidates: list[str] = []
    if permalink:
        m = re.search(r"mercadolibre\.com\.[a-z]+/([^/?]+)", permalink)
        if m:
            slug = m.group(1)
            slug = re.sub(r"^MLM-?\d+-", "", slug)
            slug = re.sub(r"-_JM$", "", slug, flags=re.IGNORECASE)
            slug = re.sub(r"-jm$", "", slug, flags=re.IGNORECASE)
            kw = slug.replace("-", " ").replace("_", " ").strip().lower()
            if kw:
                candidates.append(kw)
    if fallback_title:
        t = re.sub(r"[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]", " ", fallback_title).lower()
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            candidates.append(t)

    for c in candidates:
        words = c.split()
        # Quitar colores al final
        while words and words[-1] in SPANISH_COLORS:
            words.pop()
        if words:
            return " ".join(words[:max_words])
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
    Retorna {keyword, items, total, cached, fetched_at, attempts}.

    Si la primera busqueda devuelve 0 items, reintenta con keyword mas corto.
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
                "attempts": [],
            }

    attempts: list[dict] = []
    raw_items: list[dict] = []
    final_keyword = ""

    # Intentos progresivamente mas cortos: 7 -> 5 -> 3 palabras
    for word_cap in (7, 5, 3):
        kw = keyword_from_permalink(permalink, title, max_words=word_cap)
        if not kw or any(a["keyword"] == kw for a in attempts):
            continue
        logger.info(f"Apify intento word_cap={word_cap} keyword='{kw}'")
        items = call_apify(kw, max_pages=1)
        attempts.append({"keyword": kw, "results": len(items)})
        if items:
            raw_items = items
            final_keyword = kw
            break

    if not final_keyword:
        # Si nada arrojo resultados, conservamos el ultimo keyword intentado
        final_keyword = attempts[-1]["keyword"] if attempts else keyword_from_permalink(permalink, title)

    save_cache(ml_item_id, final_keyword, raw_items)
    return {
        "keyword": final_keyword,
        "items": raw_items[:25],
        "total": min(len(raw_items), 25),
        "cached": False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "attempts": attempts,
    }
