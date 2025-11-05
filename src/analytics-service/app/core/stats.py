import httpx
from typing import List, Dict, Any, Optional

from datetime import datetime, timedelta
from sqlmodel import select, func, Session # type: ignore

from app.models.analytics import ClickEvent
from app.config import URL_SERVICE_URL, USERS_SERVICE_URL, ADMIN_TOKEN

def calculate_stats(
    session: Session,
    events: List[ClickEvent],
    url_ids: List[int],
    selected_date: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit_recent_clicks: int = 10,
    is_admin: bool = False
) -> Dict[str, Any]:
    if not events:
        return {
            "total_clicks": 0,
            "unique_ips": 0,
            "total_links": len(url_ids) if url_ids else 0,
            "countries": {},
            "devices": {},
            "browsers": {},
            "cities": {},
            "operating_systems": {},
            "recent_clicks": [],
            "hourly_stats": [],
            "daily_stats": [],
            "period_stats": [],
            "device_stats": [],
            "os_stats": [],
            **({"top_referrers": {}, "top_user_agents": {}, "top_ips": {}} if is_admin else {})
        }
    
    total_clicks = len(events)
    
    unique_ips = len(set(event.ip_address for event in events))
    unique_links = len(set(event.url_id for event in events))
    
    cities = {}
    countries = {}

    devices = {}
    browsers = {}
    operating_systems = {}

    referrers = {} if is_admin else None
    user_agents = {} if is_admin else None
    ip_counts = {} if is_admin else None
    
    hourly_clicks = [0] * 24
    daily_clicks = {}
    monthly_clicks = {}
    
    for event in events:
        if event.country and event.country != "Unknown":
            countries[event.country] = countries.get(event.country, 0) + 1
        
        if event.city and event.city != "Unknown":
            cities[event.city] = cities.get(event.city, 0) + 1
        
        if event.device_type and event.device_type != "Unknown":
            devices[event.device_type] = devices.get(event.device_type, 0) + 1
            
        if event.browser and event.browser != "Unknown":
            browsers[event.browser] = browsers.get(event.browser, 0) + 1
            
        if event.os and event.os != "Unknown":
            operating_systems[event.os] = operating_systems.get(event.os, 0) + 1
        
        if is_admin:
            if event.referer:
                referrers[event.referer] = referrers.get(event.referer, 0) + 1
                
            if event.user_agent:
                user_agents[event.user_agent] = user_agents.get(event.user_agent, 0) + 1
                
            if event.ip_address:
                ip_counts[event.ip_address] = ip_counts.get(event.ip_address, 0) + 1
        
        hour = event.clicked_at.hour
        hourly_clicks[hour] += 1
        
        day = event.clicked_at.date().isoformat()
        daily_clicks[day] = daily_clicks.get(day, 0) + 1
        
        month = event.clicked_at.strftime("%Y-%m")
        monthly_clicks[month] = monthly_clicks.get(month, 0) + 1
    
    if selected_date:
        try:
            selected_dt = datetime.fromisoformat(selected_date)
            selected_day = selected_dt.date().isoformat()
            
            day_events = [e for e in events if e.clicked_at.date().isoformat() == selected_day]
            day_hourly_clicks = [0] * 24
            
            for event in day_events:
                hour = event.clicked_at.hour
                day_hourly_clicks[hour] += 1
            
            hourly_stats = [
                {"hour": f"{i:02d}:00", "clicks": day_hourly_clicks[i]} 
                for i in range(24)
            ]
        except ValueError:
            hourly_stats = [
                {"hour": f"{i:02d}:00", "clicks": hourly_clicks[i]} 
                for i in range(24)
            ]
    else:
        hourly_stats = [
            {"hour": f"{i:02d}:00", "clicks": hourly_clicks[i]} 
            for i in range(24)
        ]
    
    recent_events = sorted(events, key=lambda x: x.clicked_at, reverse=True)[:limit_recent_clicks]
    recent_clicks = [
        {
            "id": event.id,
            "url_id": event.url_id,
            **({"ip_address": event.ip_address} if is_admin else {}),
            "country": event.country,
            "city": event.city,
            "device_type": event.device_type,
            "browser": event.browser,
            **({"os": event.os, "referer": event.referer} if is_admin else {}),
            "clicked_at": event.clicked_at.isoformat()
        }
        for event in recent_events
    ]
    
    daily_stats = [
        {"date": date, "clicks": clicks} 
        for date, clicks in sorted(daily_clicks.items())
    ][-30:]
    
    period_stats = [
        {"month": month, "clicks": clicks} 
        for month, clicks in sorted(monthly_clicks.items())
    ]
    
    device_stats = [
        {"device": device, "clicks": clicks} 
        for device, clicks in sorted(devices.items(), key=lambda x: x[1], reverse=True)
    ]
    
    os_stats = [
        {"os": os, "clicks": clicks} 
        for os, clicks in sorted(operating_systems.items(), key=lambda x: x[1], reverse=True)
    ]
    
    result = {
        "total_clicks": total_clicks,
        "unique_ips": unique_ips,
        "total_links": unique_links,
        
        "countries": dict(sorted(countries.items(), key=lambda x: x[1], reverse=True)[:20 if is_admin else 10]),
        "cities": dict(sorted(cities.items(), key=lambda x: x[1], reverse=True)[:20 if is_admin else 10]),
        
        "devices": dict(sorted(devices.items(), key=lambda x: x[1], reverse=True)),
        "browsers": dict(sorted(browsers.items(), key=lambda x: x[1], reverse=True)[:15 if is_admin else 10]),
        "operating_systems": dict(sorted(operating_systems.items(), key=lambda x: x[1], reverse=True)[:15 if is_admin else 10]),
        
        "hourly_stats": hourly_stats,
        "daily_stats": daily_stats,
        "period_stats": period_stats,
        "device_stats": device_stats,
        "os_stats": os_stats,
        
        "recent_clicks": recent_clicks
    }
    
    if is_admin:
        result.update({
            "top_referrers": dict(sorted(referrers.items(), key=lambda x: x[1], reverse=True)[:15]),
            "top_user_agents": dict(sorted(user_agents.items(), key=lambda x: x[1], reverse=True)[:10]),
            "top_ips": dict(sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:20])
        })
    
    return result

def calculate_public_stats(session: Session) -> Dict[str, Any]:
    month_ago = datetime.now() - timedelta(days=30)
    try:
        active_users_query = select(func.count(func.distinct(ClickEvent.user_id))).where(
            ClickEvent.clicked_at >= month_ago,
            ClickEvent.user_id.isnot(None)
        )

        active_users_month = session.exec(active_users_query).first() or 0
    except Exception:
        active_users_month = 0
    
    return {
        "total_urls": 0,
        "urls_today": 0,
        "total_users": 0,
        "active_users_month": active_users_month,
        "popular_domains": []
    }

async def calculate_public_stats_async(session: Session) -> Dict[str, Any]:
    result = {
        "links": {
            "total": 0,
            "today": 0,
            "total_clicks": 0,
        },
        "users": {
            "total": 0,
            "active_month": 0,
        },
        "popular_domains": {
            "data": [],
        },
        "week_stats": [],
        "month_stats": [],
        "three_month_stats": [],
        "generated_at": datetime.now().isoformat()
    }

    try:
        total_clicks = session.exec(select(func.count(ClickEvent.id))).first() or 0
    except Exception:
        total_clicks = 0

    result["links"]["total_clicks"] = total_clicks
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{URL_SERVICE_URL}/admin/urls/stats",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )

        if response.status_code == 200:
            data = response.json()
            result["links"].update({
                "total": data.get("total", 0),
                "today": data.get("today", 0)
            })
        
        response = await client.get(
            f"{USERS_SERVICE_URL}/admin/users/stats",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )

        if response.status_code == 200:
            data = response.json()
            result["users"].update({
                "total": data.get("total", 0),
                "active_month": data.get("active_month", 0)
            })
        
        response = await client.get(
            f"{URL_SERVICE_URL}/admin/urls/popular-domains",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )

        if response.status_code == 200:
            data = response.json()
            result["popular_domains"]["data"] = data.get("domains", [])
    
    three_months_ago = datetime.now() - timedelta(days=90)
    month_ago = datetime.now() - timedelta(days=30)
    week_ago = datetime.now() - timedelta(days=7)
    
    events_query = select(ClickEvent).where(
        ClickEvent.clicked_at >= three_months_ago
    )
    
    events = session.exec(events_query).all()
    url_ids = list(set(event.url_id for event in events))
    
    week_stats_data = calculate_stats(
        session=session,
        events=[e for e in events if e.clicked_at >= week_ago],
        url_ids=url_ids,
        start_date=week_ago,
        end_date=datetime.now(),
        is_admin=False
    )
    
    month_stats_data = calculate_stats(
        session=session,
        events=[e for e in events if e.clicked_at >= month_ago],
        url_ids=url_ids,
        start_date=month_ago,
        end_date=datetime.now(),
        is_admin=False
    )
    
    three_month_stats_data = calculate_stats(
        session=session,
        events=events,
        url_ids=url_ids,
        start_date=three_months_ago,
        end_date=datetime.now(),
        is_admin=False
    )
    
    def format_daily_stats_for_period(daily_stats, days_count):
        today = datetime.now().date()
        result_stats = []
        
        for i in range(days_count - 1, -1, -1):
            date = today - timedelta(days=i)
            date_str = date.isoformat()
            clicks = 0
            
            for stat in daily_stats:
                if stat["date"] == date_str:
                    clicks = stat["clicks"]
                    break
            
            result_stats.append({
                "date": date_str,
                "clicks": clicks
            })
        
        return result_stats
    
    result["week_stats"] = format_daily_stats_for_period(week_stats_data["daily_stats"], 7)
    result["month_stats"] = format_daily_stats_for_period(month_stats_data["daily_stats"], 30)
    result["three_month_stats"] = format_daily_stats_for_period(three_month_stats_data["daily_stats"], 90)
    
    return result