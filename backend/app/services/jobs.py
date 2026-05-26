from datetime import datetime, timezone
import logging
import traceback

from app.db.mysql_tokens import list_ml_tokens
from app.db.supabase_client import supabase
from app.services.ml_api import MLClient
from app.services.snapshots import ensure_account, take_snapshot
from app.services.sales import sync_sales
from app.services.competitor_monitor import run_competitor_monitoring_job
from app.services.sales_archive import run_sales_archive_job

logger = logging.getLogger(__name__)


def run_daily_job() -> dict:
    sb = supabase()
    run = (
        sb.table("cron_runs")
        .insert({"job_name": "daily_snapshot", "status": "running"})
        .execute()
    )
    run_id = run.data[0]["id"]

    accounts = products = changes = sales_rows = 0
    err: str | None = None

    try:
        tokens = list_ml_tokens()
        for tok in tokens:
            try:
                with MLClient(tok) as client:
                    account_id = ensure_account(client.ml_user_id, client.ml_nickname)
                    snap = take_snapshot(client, account_id)
                    products += snap["items"]
                    changes += snap["changes"]
                    sales_rows += sync_sales(client, account_id, since_days=3)
                accounts += 1
            except Exception as e:
                logger.exception(f"Fallo cuenta {tok.nickname}: {e}")
                raise
        status = "ok"
    except Exception as e:
        err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        status = "error"

    # Monitoreo de competencia (no es critico, no falla el job principal)
    try:
        comp_res = run_competitor_monitoring_job()
        logger.info(f"Competitor monitoring: {comp_res}")
    except Exception as e:
        logger.exception(f"competitor monitoring fallo: {e}")

    # Archive de ventas (mantiene 4 semanas + archive mensual)
    try:
        arch_res = run_sales_archive_job()
        logger.info(f"Sales archive: {arch_res}")
    except Exception as e:
        logger.exception(f"sales archive fallo: {e}")

    sb.table("cron_runs").update(
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "accounts_processed": accounts,
            "products_processed": products,
            "changes_detected": changes,
            "sales_inserted": sales_rows,
            "error_message": err,
        }
    ).eq("id", run_id).execute()

    return {
        "run_id": run_id,
        "status": status,
        "accounts": accounts,
        "products": products,
        "changes": changes,
        "sales": sales_rows,
        "error": err,
    }
