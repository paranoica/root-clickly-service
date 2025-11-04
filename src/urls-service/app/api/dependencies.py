import httpx
import logging

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from typing import Optional
from app.config import USERS_SERVICE_URL, ADMIN_TOKEN

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{USERS_SERVICE_URL}/verify-token",
                headers={"Authorization": f"Bearer {credentials.credentials}"}
            )

            if response.status_code == 200:
                user_data = response.json()
                return user_data
            else:
                return None
    except Exception as e:
        logger.error(f"Error verifying token: {e}")
        return None

async def get_current_user(user_data: dict = Depends(verify_token)) -> dict:
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    return {"id": user_data["user_id"]}

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    
    user_data = await verify_token(credentials)
    if user_data:
        return {"id": user_data["user_id"]}
    
    return None

async def verify_admin_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    if not credentials:
        logger.warning("Admin access attempted without token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    if credentials.credentials != ADMIN_TOKEN:
        logger.warning("Admin access attempted with invalid token")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return True