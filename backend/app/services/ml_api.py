from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import logging
import threading
import time
from typing import Any, Iterable

import httpx

from app.config import get_settings
from app.db.mysql_tokens import MLAccountToken, update_ml_tokens

ML_BASE = "https://api.mercadolibre.com"
logger = logging.getLogger(__name__)


class MLClient:
    def __init__(self, token: MLAccountToken):
        self.token = token
        self._client = httpx.Client(timeout=30.0, base_url=ML_BASE, limits=httpx.Limits(max_connections=30, max_keepalive_connections=30))
        self._refresh_lock = threading.Lock()
        me = self._get("/users/me")
        self.ml_user_id: int = int(me["id"])
        self.ml_nickname: str = me.get("nickname") or token.nickname

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "MLClient":
        return self

    def __exit__(self, *_):
        self.close()

    def _refresh(self) -> bool:
        with self._refresh_lock:
            s = get_settings()
            if not s.ML_CLIENT_ID or not s.ML_CLIENT_SECRET:
                return False
            r = httpx.post(
                f"{ML_BASE}/oauth/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": s.ML_CLIENT_ID,
                    "client_secret": s.ML_CLIENT_SECRET,
                    "refresh_token": self.token.refresh_token,
                },
                timeout=30.0,
            )
            r.raise_for_status()
            d = r.json()
            new_access = d["access_token"]
            new_refresh = d.get("refresh_token", self.token.refresh_token)
            update_ml_tokens(self.token.nickname, new_access, new_refresh)
            self.token.access_token = new_access
            self.token.refresh_token = new_refresh
            return True

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token.access_token}"}

    def _get(self, path: str, params: dict | None = None) -> Any:
        r = self._client.get(path, params=params, headers=self._headers())
        if r.status_code == 401 and self._refresh():
            r = self._client.get(path, params=params, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def iter_item_ids(self) -> Iterable[str]:
        path = f"/users/{self.ml_user_id}/items/search"
        params: dict = {"search_type": "scan", "limit": 100}
        while True:
            data = self._get(path, params=params)
            ids = data.get("results", [])
            for i in ids:
                yield i
            scroll = data.get("scroll_id")
            if not ids or not scroll:
                return
            params = {"search_type": "scan", "scroll_id": scroll}

    def get_items_multi(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(ids), 20):
            chunk = ids[i : i + 20]
            data = self._get("/items", params={"ids": ",".join(chunk)})
            for entry in data:
                if entry.get("code") == 200 and entry.get("body"):
                    out.append(entry["body"])
        return out

    def list_orders_since(self, since: datetime) -> list[dict]:
        out: list[dict] = []
        offset, limit = 0, 50
        since_str = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000-00:00")
        while True:
            data = self._get(
                "/orders/search",
                params={
                    "seller": self.ml_user_id,
                    "order.date_created.from": since_str,
                    "limit": limit,
                    "offset": offset,
                    "sort": "date_asc",
                },
            )
            results = data.get("results", [])
            out.extend(results)
            paging = data.get("paging", {})
            total = paging.get("total", 0)
            offset += limit
            if offset >= total or not results:
                break
        return out

    def item_visits(self, item_id: str, days: int = 1) -> dict:
        return self._get(
            f"/items/{item_id}/visits/time_window",
            params={"last": days, "unit": "day"},
        )

    def items_visits_total(self, ids: list[str], days: int, max_workers: int = 12) -> dict[str, int]:
        """Returns {item_id: total_visits} para los ultimos N dias usando per-item concurrente.

        El endpoint batch /items/visits devuelve 400 consistentemente, por eso vamos directo a per-item.
        Rate limit ML: 1500/min por seller. Con 12 workers y ~500ms/request promedio ~ 24 req/seg = 1440/min.
        """
        out: dict[str, int] = {}
        out_lock = threading.Lock()

        def _fetch(iid: str) -> None:
            for attempt in range(3):
                try:
                    d = self._get(
                        f"/items/{iid}/visits/time_window",
                        params={"last": days, "unit": "day"},
                    )
                    v = int(d.get("total_visits") or 0)
                    with out_lock:
                        out[iid] = v
                    return
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        time.sleep(2.0 * (attempt + 1))
                        continue
                    if e.response.status_code in (404, 403):
                        return
                    logger.debug(f"visits {iid} d={days} HTTP {e.response.status_code} attempt {attempt+1}")
                except Exception as e:
                    logger.debug(f"visits {iid} d={days} attempt {attempt+1} fail: {e}")
                    time.sleep(0.5 + attempt * 0.5)

        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(_fetch, iid) for iid in ids]
            for _ in as_completed(futures):
                pass
        return out
