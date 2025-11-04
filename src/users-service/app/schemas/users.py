from pydantic import BaseModel, EmailStr, validator
from datetime import datetime
from typing import Optional
import re

class UserCreate(BaseModel):
    email: EmailStr

    username: str
    password: str

    @validator("username")
    def validate_username(cls, v):
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters long")
        
        if len(v) > 20:
            raise ValueError("Username must be at most 20 characters long")
        
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        
        return v
    
    @validator("password")
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError("Password must contain at least one special character")
        return v
    
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None

    password: Optional[str] = None
    current_password: str
    
    @validator("username")
    def validate_username(cls, v):
        if v is not None:
            if len(v) < 3:
                raise ValueError("Username must be at least 3 characters long")
            
            if len(v) > 20:
                raise ValueError("Username must be at most 20 characters long")
            
            if not re.match(r"^[a-zA-Z0-9_]+$", v):
                raise ValueError("Username can only contain letters, numbers, and underscores")
        return v
    
    @validator("password")
    def validate_password(cls, v):
        if v is not None:
            if len(v) < 8:
                raise ValueError("Password must be at least 8 characters long")
            
            if not re.search(r"[A-Z]", v):
                raise ValueError("Password must contain at least one uppercase letter")
            
            if not re.search(r"[a-z]", v):
                raise ValueError("Password must contain at least one lowercase letter")
            
            if not re.search(r"[0-9]", v):
                raise ValueError("Password must contain at least one digit")
            
            if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
                raise ValueError("Password must contain at least one special character")
        return v
    
class UserLogin(BaseModel):
    identifier: str
    password: str

class UserResponse(BaseModel):
    id: int

    email: str
    username: str

    is_active: bool
    email_verified: bool

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[int] = None
    token_version: Optional[int] = None

class EmailActivationRequest(BaseModel):
    token: str

class ResendActivationRequest(BaseModel):
    email: str

class EmailActivationResponse(BaseModel):
    message: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str