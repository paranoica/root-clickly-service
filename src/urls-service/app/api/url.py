import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, status, Request, Path, Query
from fastapi.responses import RedirectResponse

from app.database import SessionDep
from app.schemas.url import UrlCreate, UrlUpdate, UrlResponse, UrlListResponse

from app.crud.url import (
    create_url,
    get_user_urls, update_url, deactivate_url,
    get_url_with_qr_code, count_user_urls, activate_url
)

from app.api.dependencies import get_current_user, get_current_user_optional
from app.core.rate_limiting import limiter, RATE_LIMIT_GENERAL, RATE_LIMIT_STRICT
from app.config import FRONTEND_URL

logger = logging.getLogger(__name__)
router = APIRouter()

def format_url_response(url, request: Request) -> UrlResponse:
    return UrlResponse(
        id=url.id,
        original_url=url.original_url,
        short_code=url.short_code,
        short_url=f"{FRONTEND_URL}/{url.short_code}",
        user_id=url.user_id,
        is_active=url.is_active,
        has_password=url.password is not None,
        created_at=url.created_at,
        expires_at=url.expires_at,
        remaining_clicks=url.remaining_clicks,
        hide_thumbnail=url.hide_thumbnail,
        safety_check_status=url.safety_check_status,
        safety_check_at=url.safety_check_at
    )

@router.post("/shorten", response_model=UrlResponse)
@limiter.limit(RATE_LIMIT_GENERAL)
async def shorten_url(
    url_data: UrlCreate,
    request: Request,
    session: SessionDep, # type: ignore
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    user_id = current_user["id"] if current_user else -1
    
    try:
        url = await create_url(session, url_data, user_id)
        return format_url_response(url, request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error shortening URL: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/{url_id}", response_model=UrlResponse)
@limiter.limit(RATE_LIMIT_GENERAL)
async def update_url_endpoint(
    url_id: int,
    url_data: UrlUpdate,
    request: Request,
    session: SessionDep, # type: ignore
    current_user: dict = Depends(get_current_user)
):
    try:
        url = await update_url(session, url_id, url_data, current_user["id"])
        if not url:
            raise HTTPException(status_code=404, detail="URL not found or access denied")
        return format_url_response(url, request)
    except ValueError as e:
        logger.warning(f"Error while updating URL {url_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error while updating URL {url_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{url_id}/deactivate", response_model=UrlResponse)
async def deactivate_url_endpoint(
    url_id: int,
    request: Request,
    session: SessionDep, # type: ignore
    current_user: dict = Depends(get_current_user)
):
    url = deactivate_url(session, url_id, current_user["id"])
    if not url:
        raise HTTPException(status_code=404, detail="URL not found or access denied")
    return format_url_response(url, request)

@router.patch("/{url_id}/activate", response_model=UrlResponse)
async def deactivate_url_endpoint(
    url_id: int,
    request: Request,
    session: SessionDep, # type: ignore
    current_user: dict = Depends(get_current_user)
):
    url = activate_url(session, url_id, current_user["id"])
    if not url:
        raise HTTPException(status_code=404, detail="URL not found or access denied")
    return format_url_response(url, request)

@router.get("/my", response_model=UrlListResponse)
async def get_my_urls(
    request: Request,
    session: SessionDep, # type: ignore
    current_user: dict = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None),
    created_from: Optional[str] = Query(None),
    created_to: Optional[str] = Query(None),
    min_clicks: Optional[int] = Query(None, ge=0),
    max_clicks: Optional[int] = Query(None, ge=0),
    domain: Optional[str] = Query(None)
):
    created_from_dt = None
    created_to_dt = None
    
    if created_from:
        try:
            created_from_dt = datetime.fromisoformat(created_from.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_from date format. Use ISO format.")
    
    if created_to:
        try:
            created_to_dt = datetime.fromisoformat(created_to.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_to date format. Use ISO format.")
    
    urls = get_user_urls(
        session, 
        current_user["id"], 
        skip, 
        limit,
        is_active=is_active,
        created_from=created_from_dt,
        created_to=created_to_dt,
        domain=domain
    )
    
    if min_clicks is not None or max_clicks is not None:
        from app.crud.url import get_clicks_count_for_user_url

        token = None

        if hasattr(request, 'headers') and 'authorization' in request.headers:
            auth_header = request.headers.get('authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]

        if token:
            filtered_urls = []
            for url in urls:
                clicks_count = await get_clicks_count_for_user_url(url.id, current_user["id"], token)
                if min_clicks is not None and clicks_count < min_clicks:
                    continue

                if max_clicks is not None and clicks_count > max_clicks:
                    continue

                filtered_urls.append(url)

            urls = filtered_urls
            total = len(urls)
        else:
            urls = []
            total = 0
    else:
        total = count_user_urls(
            session,
            current_user["id"],
            is_active=is_active,
            created_from=created_from_dt,
            created_to=created_to_dt,
            domain=domain
        )

    formatted_urls = [format_url_response(url, request) for url in urls]
    return UrlListResponse(
        urls=formatted_urls, 
        total=total,
        skip=skip,
        limit=limit,
        filters={
            "is_active": is_active,
            "created_from": created_from,
            "created_to": created_to,
            "min_clicks": min_clicks,
            "max_clicks": max_clicks,
            "domain": domain
        }
    )

@router.get("/{url_id}/qr", response_model=dict)
async def get_url_qr_code(
    url_id: int,
    request: Request,
    session: SessionDep, # type: ignore
    current_user: dict = Depends(get_current_user)
):
    base_url = f"{request.url.scheme}://{request.url.netloc}"
    result = get_url_with_qr_code(session, url_id, current_user["id"], base_url)
    
    if not result:
        raise HTTPException(status_code=404, detail="URL not found")
    
    return {
        "url_id": result["url"].id,
        "short_code": result["url"].short_code,
        "short_url": result["short_url"],
        "qr_code": result["qr_code"]
    }