from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ClickEventCreate(BaseModel):
    url_id: int
    user_agent: str
    referer: Optional[str] = None

class ClickEventResponse(BaseModel):
    id: int

    url_id: int
    user_id: Optional[int]

    ip_address: str
    user_agent: str
    referer: Optional[str]

    country: Optional[str]
    city: Optional[str]

    device_type: Optional[str]
    browser: Optional[str]
    os: Optional[str]
    
    clicked_at: datetime