import httpx
import logging

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from urllib.parse import urlparse
from sqlmodel import select, func # type: ignore

from app.database import SessionDep
from app.crud.url import check_and_deactivate_expired_urls, get_url_by_id
from app.api.dependencies import verify_admin_token
from app.schemas.url import UrlResponse, SafetyCheckRequest, SafetyCheckResponse
from app.core.safe_browsing import safe_browsing_service

from app.models.url import Url
from app.config import ADMIN_TOKEN, ANALYTICS_SERVICE_URL

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/check-url-safety", response_model=SafetyCheckResponse)
async def check_url_safety(
    request_data: SafetyCheckRequest,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    try:
        safety_check = await safe_browsing_service.check_url_safety(request_data.url)
        return SafetyCheckResponse(
            url=request_data.url,
            is_safe=safety_check["is_safe"],
            threats=safety_check["threats"],
            details=safety_check["details"],
            threat_descriptions=[
                safe_browsing_service.get_threat_description(threat) 
                for threat in safety_check["threats"]
            ] if safety_check["threats"] else []
        )
    except Exception as e:
        logger.error(f"Error checking URL safety: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Safety check failed: {str(e)}")

@router.get("/urls/stats")
async def get_urls_stats_summary(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    total_urls = session.exec(select(func.count(Url.id))).first() or 0
    today = datetime.now().date()

    today_urls_query = select(func.count(Url.id)).where(func.date(Url.created_at) == today)
    today_urls = session.exec(today_urls_query).first() or 0

    active_urls_query = select(func.count(Url.id)).where(Url.is_active == True)
    active_urls = session.exec(active_urls_query).first() or 0
    
    return {
        "total": total_urls,
        "today": today_urls,
        "active": active_urls
    }

@router.get("/urls/popular-domains")
async def get_popular_domains(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    limit: int = Query(10, ge=1, le=50)
):
    urls = session.exec(select(Url.original_url)).all()
    domain_counts = {}

    for original_url in urls:
        try:
            parsed = urlparse(original_url)
            domain = parsed.netloc.lower()

            if domain:
                if domain.startswith('www.'):
                    domain = domain[4:]

                domain_counts[domain] = domain_counts.get(domain, 0) + 1
        except Exception:
            continue

    popular_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return {
        "domains": [
            {"domain": domain, "count": count}
            for domain, count in popular_domains
        ]
    }

def format_url_response(url, request: Request) -> UrlResponse:
    base_url = f"{request.url.scheme}://{request.url.netloc}"
    return UrlResponse(
        id=url.id,
        original_url=url.original_url,
        short_code=url.short_code,
        short_url=f"{base_url}/{url.short_code}",
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

async def get_clicks_count_for_url(url_id: int) -> int:
    try:
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
            response = await client.get(f"{ANALYTICS_SERVICE_URL}/admin/clicks/{url_id}", headers=headers, timeout=5.0)
            
            if response.status_code == 200:
                data = response.json()
                return data.get("total_clicks", 0)
            else:
                return 0
    except Exception as e:
        return 0

@router.post("/cleanup-expired")
async def cleanup_expired_urls(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    count = check_and_deactivate_expired_urls(session)
    return {"message": f"Deactivated {count} URLs"}

@router.get("/urls")
async def get_all_urls(
    request: Request,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None),
    created_from: Optional[str] = Query(None),
    created_to: Optional[str] = Query(None),
    min_clicks: Optional[int] = Query(None, ge=0),
    max_clicks: Optional[int] = Query(None, ge=0),
    domain: Optional[str] = Query(None)
):
    query = select(Url)
    
    if user_id is not None:
        query = query.where(Url.user_id == user_id)

    if is_active is not None:
        query = query.where(Url.is_active == is_active)
    
    if created_from:
        try:
            created_from_dt = datetime.fromisoformat(created_from.replace('Z', '+00:00'))
            query = query.where(Url.created_at >= created_from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_from date format. Use ISO format.")
    
    if created_to:
        try:
            created_to_dt = datetime.fromisoformat(created_to.replace('Z', '+00:00'))
            query = query.where(Url.created_at <= created_to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid created_to date format. Use ISO format.")
    
    if domain:
        query = query.where(Url.original_url.contains(f"://{domain}"))
    
    count_query = select(func.count(Url.id))
    if user_id is not None:
        count_query = count_query.where(Url.user_id == user_id)

    if is_active is not None:
        count_query = count_query.where(Url.is_active == is_active)

    if created_from:
        try:
            created_from_dt = datetime.fromisoformat(created_from.replace('Z', '+00:00'))
            count_query = count_query.where(Url.created_at >= created_from_dt)
        except ValueError:
            pass

    if created_to:
        try:
            created_to_dt = datetime.fromisoformat(created_to.replace('Z', '+00:00'))
            count_query = count_query.where(Url.created_at <= created_to_dt)
        except ValueError:
            pass

    if domain:
        count_query = count_query.where(Url.original_url.contains(f"://{domain}"))
    
    total_count = session.exec(count_query).first()
    
    if min_clicks is not None or max_clicks is not None:
        all_urls = session.exec(query.order_by(Url.created_at.desc())).all()
        filtered_urls = []

        for url in all_urls:
            clicks_count = await get_clicks_count_for_url(url.id)

            if min_clicks is not None and clicks_count < min_clicks:
                continue

            if max_clicks is not None and clicks_count > max_clicks:
                continue

            filtered_urls.append(url)

        total_count = len(filtered_urls)
        urls = filtered_urls[skip:skip + limit]
    else:
        query = query.order_by(Url.created_at.desc()).offset(skip).limit(limit)
        urls = session.exec(query).all()
    
    formatted_urls = [format_url_response(url, request) for url in urls]
    return {
        "urls": formatted_urls,
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "filters": {
            "user_id": user_id,
            "is_active": is_active,
            "created_from": created_from,
            "created_to": created_to,
            "min_clicks": min_clicks,
            "max_clicks": max_clicks,
            "domain": domain
        }
    }

@router.get("/urls/{url_id}")
async def get_url_by_id_admin(
    url_id: int,
    request: Request,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    url = get_url_by_id(session, url_id)
    if not url:
        raise HTTPException(status_code=404, detail="URL not found")
    return format_url_response(url, request)

@router.get("/urls/{url_id}/user-id")
async def get_url_user_id(
    url_id: int,
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token)
):
    url = get_url_by_id(session, url_id)
    if not url:
        raise HTTPException(status_code=404, detail="URL not found")
    return {"user_id": url.user_id}

@router.post("/urls/security-scan")
async def security_scan_urls(
    session: SessionDep, # type: ignore
    admin_verified: bool = Depends(verify_admin_token),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[int] = Query(None)
):
    try:
        query = select(Url).where(Url.is_active == True)
        if user_id:
            query = query.where(Url.user_id == user_id)
        
        query = query.limit(limit)
        urls = session.exec(query).all()
        
        results = []
        unsafe_count = 0
        
        for url in urls:
            try:
                safety_check = await safe_browsing_service.check_url_safety(url.original_url)
                import json
                
                url.safety_check_status = "safe" if safety_check["is_safe"] else "unsafe"
                url.safety_check_at = datetime.now()
                url.safety_threats = json.dumps(safety_check["threats"]) if safety_check["threats"] else None
                
                result = {
                    "url_id": url.id,
                    "short_code": url.short_code,
                    "original_url": url.original_url,
                    "is_safe": safety_check["is_safe"],
                    "threats": safety_check["threats"],
                    "details": safety_check["details"]
                }
                
                if not safety_check["is_safe"]:
                    url.is_active = False
                    unsafe_count += 1

                    result["action"] = "deactivated"
                else:
                    result["action"] = "no_action"
                
                session.add(url)
                results.append(result)
                
            except Exception as e:
                logger.error(f"Error scanning URL {url.id}: {str(e)}")

                url.safety_check_status = "error"
                url.safety_check_at = datetime.now()

                session.add(url)
                
                results.append({
                    "url_id": url.id,
                    "short_code": url.short_code,
                    "original_url": url.original_url,
                    "is_safe": None,
                    "threats": [],
                    "details": f"Scan failed: {str(e)}",
                    "action": "scan_failed"
                })
                
        session.commit()
        
        return {
            "scanned_count": len(urls),
            "unsafe_count": unsafe_count,
            "deactivated_count": unsafe_count,
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Error during security scan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Security scan failed: {str(e)}")