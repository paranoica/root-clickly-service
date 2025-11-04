from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database import SessionDep
from app.core.users import verify_token
from app.crud.users import get_user_by_id_optional
from app.models.user import User

from app.config import ADMIN_TOKEN
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer()

def get_current_user(session: SessionDep, credentials: HTTPAuthorizationCredentials = Depends(security)) -> User: # type: ignore
    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    user_id, version = payload
    user = get_user_by_id_optional(session, user_id)

    if user is None or user.token_version != version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    return user

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