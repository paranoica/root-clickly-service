from sqlmodel import SQLModel, Field # type: ignore

from datetime import datetime
from typing import Optional

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int = Field(primary_key=True)

    email: str = Field(unique=True, index=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str

    is_active: bool = Field(default=True)
    email_verified: bool = Field(default=False)

    last_email_sent: Optional[datetime] = Field(default=None)
    token_version: int = Field(default=1)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)