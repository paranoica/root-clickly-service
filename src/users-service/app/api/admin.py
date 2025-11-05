from fastapi import APIRouter, HTTPException, Depends, Query, Header
from typing import Optional

from datetime import datetime, timedelta
from sqlmodel import select, func # type: ignore

from app.database import SessionDep
from app.models.user import User
from app.api.dependencies import verify_admin_token

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/users/stats")
async def get_users_stats_summary(session: SessionDep, admin_verified: bool = Depends(verify_admin_token)): # type: ignore
    total_users = session.exec(select(func.count(User.id))).first() or 0
    month_ago = datetime.now() - timedelta(days=30)

    active_users_query = select(func.count(User.id)).where(
        User.is_active == True,
        User.created_at >= month_ago
    )

    active_month = session.exec(active_users_query).first() or 0
    
    today = datetime.now().date()
    today_users_query = select(func.count(User.id)).where(
        func.date(User.created_at) == today
    )

    today_users = session.exec(today_users_query).first() or 0
    
    return {
        "total": total_users,
        "active_month": active_month,
        "today": today_users
    }

@router.get("/users")
async def get_users_stats(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    is_active: Optional[bool] = Query(None),
    created_from: Optional[str] = Query(None),
    created_to: Optional[str] = Query(None)
):
    query = select(User)
    count_query = select(func.count(User.id))
    
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)

    if created_from:
        try:
            created_from_dt = datetime.fromisoformat(created_from.replace('Z', '+00:00'))
            query = query.where(User.created_at >= created_from_dt)
            count_query = count_query.where(User.created_at >= created_from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_from date format")
        
    if created_to:
        try:
            created_to_dt = datetime.fromisoformat(created_to.replace('Z', '+00:00'))
            query = query.where(User.created_at <= created_to_dt)
            count_query = count_query.where(User.created_at <= created_to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_to date format")
    
    total_count = session.exec(count_query).first() or 0
    users = session.exec(
        query.offset(offset).limit(limit).order_by(User.created_at.desc())
    ).all()
    
    users_data = [
        {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat() if user.updated_at else None
        }
        for user in users
    ]
    return {
        "users": users_data,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "filters": {
            "is_active": is_active,
            "created_from": created_from,
            "created_to": created_to
        }
    }

@router.get("/users/{user_id}")
async def get_user_by_id(
    user_id: int,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    user = session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat() if user.updated_at else None
    }