from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.routes import accounts, cron, dashboard, goals, products
from app.services.jobs import run_daily_job

DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    sched: BackgroundScheduler | None = None
    if s.ENABLE_LOCAL_SCHEDULER:
        sched = BackgroundScheduler(timezone="America/Mexico_City")
        sched.add_job(
            run_daily_job,
            CronTrigger(
                hour=s.LOCAL_SCHEDULER_HOUR,
                minute=s.LOCAL_SCHEDULER_MINUTE,
                timezone="America/Mexico_City",
            ),
            id="daily_snapshot",
            replace_existing=True,
        )
        sched.start()
    try:
        yield
    finally:
        if sched:
            sched.shutdown(wait=False)


app = FastAPI(title="Kubera ML Tracker", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().FRONTEND_ORIGIN, "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(products.router)
app.include_router(goals.router)
app.include_router(accounts.router)
app.include_router(cron.router)


@app.get("/health")
def health():
    return {"ok": True}


API_PREFIXES = ("/health", "/dashboard", "/products", "/goals", "/accounts", "/cron", "/docs", "/openapi.json", "/redoc")


@app.get("/{full_path:path}")
def spa(full_path: str):
    if any(("/" + full_path).startswith(p) for p in API_PREFIXES):
        raise HTTPException(status_code=404)
    if not DIST_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend no compilado. Corre 'npm run build' en /frontend.")
    candidate = (DIST_DIR / full_path).resolve()
    if candidate.is_file() and DIST_DIR.resolve() in candidate.parents:
        return FileResponse(candidate)
    return FileResponse(DIST_DIR / "index.html")
