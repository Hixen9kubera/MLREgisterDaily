from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator

import pymysql
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


@dataclass
class MLAccountToken:
    nickname: str
    access_token: str
    refresh_token: str


@contextmanager
def _conn() -> Iterator[pymysql.connections.Connection]:
    s = get_settings()
    c = pymysql.connect(
        host=s.DB_HOST,
        port=s.DB_PORT,
        user=s.DB_USER,
        password=s.DB_PASSWORD,
        database=s.DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        charset="utf8mb4",
        connect_timeout=15,
    )
    try:
        yield c
    finally:
        c.close()


def _fernet() -> Fernet:
    return Fernet(get_settings().DB_ENCRYPTION_KEY.encode())


def _decrypt(value: str | bytes | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.encode()
    try:
        return _fernet().decrypt(value).decode()
    except InvalidToken:
        return value.decode() if isinstance(value, bytes) else value


def list_ml_tokens() -> list[MLAccountToken]:
    sql = "SELECT cuenta AS nickname, access_token, refresh_token FROM ml_tokens"
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    out: list[MLAccountToken] = []
    for r in rows:
        out.append(
            MLAccountToken(
                nickname=str(r["nickname"]),
                access_token=_decrypt(r["access_token"]) or "",
                refresh_token=_decrypt(r["refresh_token"]) or "",
            )
        )
    return out


def update_ml_tokens(nickname: str, access_token: str, refresh_token: str) -> None:
    f = _fernet()
    sql = "UPDATE ml_tokens SET access_token=%s, refresh_token=%s WHERE cuenta=%s"
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            sql,
            (
                f.encrypt(access_token.encode()).decode(),
                f.encrypt(refresh_token.encode()).decode(),
                nickname,
            ),
        )
        c.commit()
