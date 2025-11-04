import httpx
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Path, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse

from app.database import SessionDep
from app.crud.url import get_url_by_short_code, decrement_clicks_count
from app.config import MAX_CUSTOM_URL_LENGTH, ANALYTICS_SERVICE_URL, FRONTEND_URL
from app.core.rate_limiting import limiter, RATE_LIMIT_GENERAL

logger = logging.getLogger(__name__)
router = APIRouter()

async def track_click_event(request: Request, url_id: int, short_code: str):
    try:
        headers = dict(request.headers)
        payload = {
            "url_id": url_id,
            "user_agent": headers.get("user-agent", ""),
            "referer": headers.get("referer", "")
        }
        
        request_headers = {
            "Content-Type": "application/json"
        }
        
        auth_header = headers.get("authorization")
        if auth_header:
            request_headers["Authorization"] = auth_header
        
        real_ip = headers.get("x-real-ip") or headers.get("x-forwarded-for") or request.client.host
        if real_ip:
            request_headers["X-Real-IP"] = real_ip
            request_headers["X-Forwarded-For"] = real_ip
        
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{ANALYTICS_SERVICE_URL}/events",
                json=payload,
                headers=request_headers,
                timeout=5.0
            )
    except Exception as e:
        logger.error(f"Error sending click event to Analytics Service for URL {short_code}: {e}")

def is_social_media_bot(user_agent: str) -> bool:
    social_bots = [
        "facebookexternalhit", "twitterbot", "telegrambot", "whatsapp",
        "skypebot", "discordbot", "slackbot", "linkedinbot", "vkshare",
        "applebot", "googlebot", "bingbot", "yandexbot", "viberbot",
        "facebot", "ia_archiver", "developers.google.com/+/web/snippet"
    ]

    user_agent_lower = user_agent.lower()
    return any(bot in user_agent_lower for bot in social_bots)

@router.get("/{short_code}")
@limiter.limit(RATE_LIMIT_GENERAL)
async def redirect_url(
    request: Request,
    session: SessionDep, # type: ignore
    short_code: str = Path(..., pattern=f"^[a-zA-Z0-9_-]{{4,{MAX_CUSTOM_URL_LENGTH}}}$"),
    password: str = Query(None),
    json_response: bool = Query(False)
):
    url = get_url_by_short_code(session, short_code)
    
    if not url:
        raise HTTPException(status_code=404, detail="URL not found")
    
    if not url.is_active:
        raise HTTPException(status_code=410, detail="URL is no longer active")
    
    if url.expires_at and datetime.utcnow() > url.expires_at:
        url.is_active = False

        session.add(url)
        session.commit()

        raise HTTPException(status_code=410, detail="URL has expired")
    
    if url.remaining_clicks is not None and url.remaining_clicks <= 0:
        url.is_active = False

        session.add(url)
        session.commit()

        raise HTTPException(status_code=410, detail="URL has reached maximum clicks limit")
    
    if url.password is not None:
        if password is None:
            raise HTTPException(
                status_code=401, 
                detail="Password required. Add password param"
            )
        if password != url.password:
            raise HTTPException(status_code=401, detail="Invalid password")
    
    user_agent = request.headers.get("user-agent", "")
    if is_social_media_bot(user_agent):
        base_url = f"{FRONTEND_URL}"
        short_url = f"{base_url}/{short_code}"
        
        if url.hide_thumbnail:
            html_content = f"""
                <!DOCTYPE html>
                <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Clickly - Link shortening service</title>
                        <meta http-equiv="refresh" content="0; url={url.original_url}">

                        <meta property="og:title" content="Clickly - Link shortening service">
                        <meta property="og:description" content="This is a shortened URL created with Clickly. Click it to visit the link.">
                        <meta property="og:image" content="{base_url}/api/urls/static/clickly-preview.png">
                        <meta property="og:url" content="{short_url}">
                        <meta property="og:type" content="website">
                        <meta property="og:site_name" content="Clickly">

                        <meta name="twitter:card" content="summary_large_image">
                        <meta name="twitter:title" content="Clickly - Link shortening service">
                        <meta name="twitter:description" content="This is a shortened URL created with Clickly. Click it to visit the link.">
                        <meta name="twitter:image" content="{base_url}/api/urls/static/clickly-preview.png">
                    </head>
                    <body>
                        <p>Redirecting to destination...</p>
                        <p>Если вы не перенаправлены автоматически, <a href="{url.original_url}">нажмите здесь</a>.</p>
                    </body>
                </html>
            """
        else:
            html_content = f"""
                <!DOCTYPE html>
                <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Redirecting...</title>

                        <link rel="canonical" href="{url.original_url}">
                        <meta http-equiv="refresh" content="0; url={url.original_url}">
                    </head>
                    <body>
                        <p>Redirecting...</p>
                        <p>If you are not automatically redirected, <a href="{url.original_url}">click here</a>.</p>
                    </body>
                </html>
            """
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content)
    
    decrement_clicks_count(session, url)
    session.refresh(url)

    await track_click_event(request, url.id, short_code)
    
    if json_response:
        return JSONResponse(content={"url": url.original_url}, status_code=200)
    
    return RedirectResponse(url=url.original_url, status_code=301)