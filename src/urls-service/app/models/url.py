from sqlmodel import SQLModel, Field # type: ignore
from datetime import datetime
from typing import Optional

class Url(SQLModel, table=True):
    __tablename__ = "urls"

    id: int = Field(primary_key=True)

    original_url: str = Field(index=True)
    short_code: str = Field(unique=True, index=True)

    user_id: int = Field(index=True, default=-1)
    is_active: bool = Field(default=True)
    password: Optional[str] = Field(default=None)

    remaining_clicks: Optional[int] = Field(default=None)
    hide_thumbnail: bool = Field(default=False)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(default=None)
    
    safety_check_status: Optional[str] = Field(default=None)
    safety_check_at: Optional[datetime] = Field(default=None)
    safety_threats: Optional[str] = Field(default=None)