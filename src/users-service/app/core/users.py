from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from jose import JWTError, jwt # type: ignore
from passlib.context import CryptContext # type: ignore

from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt

def verify_token(token: str) -> Optional[Tuple[int, int]]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp = payload.get("exp")

        if exp is None:
            return None
        
        if datetime.now(timezone.utc).timestamp() > float(exp):
            return None
        
        user_id_str: str = payload.get("user_id")
        token_version: int = payload.get("version", 1)

        if user_id_str is None:
            return None
        
        return int(user_id_str), token_version
    except (JWTError, ValueError):
        return None