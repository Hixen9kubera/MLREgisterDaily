from functools import lru_cache, wraps
import logging
import time
from typing import Any, Callable

import httpx
from supabase import create_client, Client
from app.config import get_settings

logger = logging.getLogger(__name__)

_TRANSIENT_EXC = (httpx.ReadError, httpx.WriteError, httpx.ConnectError, httpx.RemoteProtocolError, httpx.PoolTimeout, OSError)


def retry_on_transient(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*a, **kw):
        last = None
        for attempt in range(4):
            try:
                return fn(*a, **kw)
            except _TRANSIENT_EXC as e:
                last = e
                if attempt < 3:
                    delay = 0.2 * (2 ** attempt)
                    logger.debug(f"transient {type(e).__name__} on {fn.__name__}, retry in {delay:.2f}s")
                    time.sleep(delay)
        if last:
            raise last
    return wrapper


@lru_cache
def supabase() -> Client:
    s = get_settings()
    return create_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)
