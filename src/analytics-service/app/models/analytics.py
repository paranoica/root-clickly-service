from sqlmodel import SQLModel, Field # type: ignore
from datetime import datetime
from typing import Optional

class ClickEvent(SQLModel, table=True):
    __tablename__ = "click_events"
    
    id: Optional[int] = Field(default=None, primary_key=True)

    url_id: int = Field(index=True)
    user_id: Optional[int] = Field(default=None, index=True)

    ip_address: str
    user_agent: str
    referer: Optional[str] = Field(default=None)

    country: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)

    device_type: Optional[str] = Field(default=None)
    browser: Optional[str] = Field(default=None)
    os: Optional[str] = Field(default=None)

    clicked_at: datetime = Field(default_factory=datetime.now, index=True)