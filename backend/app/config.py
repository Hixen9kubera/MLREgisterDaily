from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str | None = None

    # MySQL (Hostinger) — fuente de verdad de los tokens ML cifrados
    DB_HOST: str
    DB_PORT: int = 3306
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_ENCRYPTION_KEY: str

    ML_TOKENS_TABLE: str = "ml_tokens"
    ML_TOKENS_ID_COL: str = "ml_user_id"
    ML_TOKENS_NICK_COL: str = "nickname"
    ML_TOKENS_ACCESS_COL: str = "access_token"
    ML_TOKENS_REFRESH_COL: str = "refresh_token"
    ML_TOKENS_EXPIRES_COL: str = "expires_at"

    # MercadoLibre OAuth (para refresh)
    ML_CLIENT_ID: str | None = None
    ML_CLIENT_SECRET: str | None = None

    # Cron
    CRON_SHARED_SECRET: str
    ENABLE_LOCAL_SCHEDULER: bool = False
    LOCAL_SCHEDULER_HOUR: int = 3
    LOCAL_SCHEDULER_MINUTE: int = 0

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # Default goal
    DEFAULT_WEEKLY_GOAL_MXN: float = 1_800_000.00


@lru_cache
def get_settings() -> Settings:
    return Settings()
