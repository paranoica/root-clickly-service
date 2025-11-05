from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response

from app.database import SessionDep
from app.api.dependencies import verify_admin_token
from app.models.analytics import ClickEvent
from app.core.stats import calculate_stats
from app.core.export import export_stats_to_json, export_stats_to_xlsx, export_clicks_to_json, export_clicks_to_xlsx
from sqlmodel import select, func, Session # type: ignore

admin_router = APIRouter()

def build_filtered_query(
    session: Session,
    url_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    base_query = select(ClickEvent)
    
    if url_id:
        base_query = base_query.where(ClickEvent.url_id == url_id)

    if user_id is not None:
        base_query = base_query.where(ClickEvent.user_id == user_id)
    
    start_dt = None
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            base_query = base_query.where(ClickEvent.clicked_at >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use ISO format.")
    
    end_dt = None
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            base_query = base_query.where(ClickEvent.clicked_at <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use ISO format.")
            
    return base_query, start_dt, end_dt

@admin_router.get("/overview", tags=["admin"])
async def admin_overview(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    now = datetime.utcnow()
    
    total_clicks = session.exec(select(func.count(ClickEvent.id))).first() or 0
    unique_ips = session.exec(select(func.count(func.distinct(ClickEvent.ip_address)))).first() or 0
    unique_links = session.exec(select(func.count(func.distinct(ClickEvent.url_id)))).first() or 0
    
    return {
        "total_clicks": total_clicks,
        "unique_ips": unique_ips,
        "unique_links": unique_links,
        "generated_at": now.isoformat(),
        "system_status": "realtime_mode"
    }

@admin_router.get("/stats", tags=["admin"])
async def admin_detailed_stats(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    url_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    selected_date: Optional[str] = None
):
    now = datetime.utcnow()
    base_query, start_dt, end_dt = build_filtered_query(session, url_id, user_id, start_date, end_date)
    
    events = session.exec(base_query).all()
    stats = calculate_stats(
        session=session,
        events=events,
        url_ids=[],
        selected_date=selected_date,
        start_date=start_dt,
        end_date=end_dt,
        limit_recent_clicks=20,
        is_admin=True
    )
    
    stats.update({
        "filter": {
            "url_id": url_id,
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date,
            "selected_date": selected_date
        },
        "generated_at": now.isoformat(),
        "system_status": "admin_detailed_mode"
    })
    return stats

@admin_router.get("/stats/export", tags=["admin"])
async def admin_export_stats(
    response: Response,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    format: str = "json",
    url_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    selected_date: Optional[str] = None
):
    if format not in ["json", "xlsx"]:
        raise HTTPException(status_code=400, detail="Format must be 'json' or 'xlsx'")

    base_query, start_dt, end_dt = build_filtered_query(session, url_id, user_id, start_date, end_date)
    
    events = session.exec(base_query).all()
    stats = calculate_stats(
        session=session,
        events=events,
        url_ids=[],
        selected_date=selected_date,
        start_date=start_dt,
        end_date=end_dt,
        limit_recent_clicks=20,
        is_admin=True
    )
    
    if format == "json":
        response.media_type = "application/json"
        response.headers["Content-Disposition"] = "attachment; filename=admin_stats.json"

        return export_stats_to_json(stats)
    else:
        response.media_type = "text/xlsx"
        response.headers["Content-Disposition"] = "attachment; filename=admin_stats.xlsx"

        return export_stats_to_xlsx(stats)

@admin_router.get("/clicks", tags=["admin"])
async def admin_get_raw_clicks(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    url_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    base_query, _, _ = build_filtered_query(session, url_id, user_id, start_date, end_date)
    count_query = select(func.count(ClickEvent.id))

    if url_id:
        count_query = count_query.where(ClickEvent.url_id == url_id)

    if user_id is not None:
        count_query = count_query.where(ClickEvent.user_id == user_id)

    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            count_query = count_query.where(ClickEvent.clicked_at >= start_dt)
        except ValueError:
            pass

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            count_query = count_query.where(ClickEvent.clicked_at <= end_dt)
        except ValueError:
            pass
    
    total_count = session.exec(count_query).first() or 0
    
    query = base_query.order_by(ClickEvent.clicked_at.desc()).limit(limit).offset(offset)
    events = session.exec(query).all()
    
    clicks = [
        {
            "id": event.id,
            "url_id": event.url_id,
            "user_id": event.user_id,
            "ip_address": event.ip_address,
            "user_agent": event.user_agent,
            "referer": event.referer,
            "country": event.country,
            "city": event.city,
            "device_type": event.device_type,
            "browser": event.browser,
            "os": event.os,
            "clicked_at": event.clicked_at.isoformat()
        }
        for event in events
    ]
    return {
        "clicks": clicks,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "filters": {
            "url_id": url_id,
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date
        }
    }

@admin_router.get("/clicks/export", tags=["admin"])
async def admin_export_raw_clicks(
    response: Response,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    format: str = "json",
    url_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    if format not in ["json", "xlsx"]:
        raise HTTPException(status_code=400, detail="Format must be 'json' or 'xlsx'")
    
    base_query, _, _ = build_filtered_query(session, url_id, user_id, start_date, end_date)
    query = base_query.order_by(ClickEvent.clicked_at.desc())
    events = session.exec(query).all()
    
    if format == "json":
        response.media_type = "application/json"
        response.headers["Content-Disposition"] = "attachment; filename=admin_clicks.json"

        return export_clicks_to_json(events)
    else:
        response.media_type = "text/xlsx"
        response.headers["Content-Disposition"] = "attachment; filename=admin_clicks.xlsx"

        return export_clicks_to_xlsx(events)

@admin_router.get("/clicks/{url_id}", tags=["admin"])
async def get_url_clicks_count(
    url_id: int,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    count_query = select(func.count(ClickEvent.id)).where(ClickEvent.url_id == url_id)
    total_clicks = session.exec(count_query).first()
    
    return {
        "url_id": url_id,
        "total_clicks": total_clicks or 0
    }