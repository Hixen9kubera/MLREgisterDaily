"""Helpers para manejar el dia en zona CDMX (UTC-6, sin DST desde 2022)."""
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Mexico_City")
except Exception:
    TZ = timezone(timedelta(hours=-6))


def today_cdmx() -> date:
    """Retorna la fecha 'hoy' segun el reloj de Ciudad de Mexico."""
    return datetime.now(TZ).date()


def cdmx_day_to_utc_range(d_from: date, d_to: date) -> tuple[str, str]:
    """
    Convierte un rango de dias en CDMX a un par (start_utc_iso, end_utc_iso_exclusivo)
    para usar en filtros .gte("sold_at", start) .lt("sold_at", end).
    El rango es: [00:00 CDMX del d_from, 00:00 CDMX del dia despues de d_to).
    """
    start_local = datetime.combine(d_from, datetime.min.time()).replace(tzinfo=TZ)
    end_local = datetime.combine(d_to + timedelta(days=1), datetime.min.time()).replace(tzinfo=TZ)
    return (
        start_local.astimezone(timezone.utc).isoformat(),
        end_local.astimezone(timezone.utc).isoformat(),
    )


def utc_to_cdmx_date(utc_iso: str) -> str:
    """Convierte un ISO timestamp UTC al ISO date (YYYY-MM-DD) en CDMX."""
    if not utc_iso:
        return ""
    s = utc_iso.replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(s)
    except Exception:
        return utc_iso[:10]
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(TZ).date().isoformat()
