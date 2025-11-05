import re
import httpx

from typing import Optional, Dict
from ipaddress import ip_address
from user_agents import parse # type: ignore

def parse_user_agent(user_agent_string: str) -> Dict[str, Optional[str]]:
    try:
        user_agent = parse(user_agent_string)
        
        if user_agent.is_mobile:
            device_type = "Mobile"
        elif user_agent.is_tablet:
            device_type = "Tablet"
        elif user_agent.is_pc:
            device_type = "Desktop"
        else:
            device_type = "Unknown"
        
        browser_name = user_agent.browser.family or "Unknown"
        browser_version = user_agent.browser.version_string
        browser = f"{browser_name} {browser_version}".strip() if browser_version else browser_name
        
        os_name = user_agent.os.family or "Unknown"  
        os_version = user_agent.os.version_string
        os = f"{os_name} {os_version}".strip() if os_version else os_name
        
        return {
            "device_type": device_type,
            "browser": browser,
            "os": os
        }
    except Exception:
        return {
            "device_type": "Unknown",
            "browser": "Unknown",
            "os": "Unknown"
        }

async def get_location_info(ip_address: str) -> Dict[str, Optional[str]]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"http://ip-api.com/json/{ip_address}?fields=status,country,city", timeout=3.0)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    return {
                        "country": data.get("country"),
                        "city": data.get("city")
                    }
    except Exception:
        pass
    
    return {
        "country": "Unknown",
        "city": "Unknown"
    }

def extract_real_ip(headers: dict) -> str:
    HOP_IP_HEADERS = [
        "x-forwarded-for",
        "forwarded",
        "x-real-ip",
        "cf-connecting-ip",
        "x-client-ip",
        "x-cluster-client-ip"
    ]

    _FOR_RE = re.compile(r"for=(?P<ip>[^;]+)", re.I)

    def _clean(ip: str) -> str | None:
        ip = ip.strip().lstrip("[").rstrip("]")
        ip = ip.split(":")[0]
        
        try:
            ip_address(ip)
            return ip
        except ValueError:
            return None

    hdr = {k.lower(): v for k, v in headers.items() if v}
    for h in HOP_IP_HEADERS:
        val = hdr.get(h)
        if not val:
            continue
        if h == "x-forwarded-for":
            for candidate in val.split(","):
                if ip := _clean(candidate):
                    return ip
        elif h == "forwarded":
            for m in _FOR_RE.finditer(val):
                if ip := _clean(m.group("ip")):
                    return ip
        else:
            if ip := _clean(val):
                return ip

    return "127.0.0.1"