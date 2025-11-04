from slowapi import Limiter, _rate_limit_exceeded_handler # type: ignore
from slowapi.util import get_remote_address # type: ignore
from slowapi.errors import RateLimitExceeded # type: ignore

from fastapi import Request, HTTPException
from decouple import config # type: ignore

RATE_LIMIT_ENABLED = config("RATE_LIMIT_ENABLED", default=True, cast=bool)
RATE_LIMIT_GENERAL = config("RATE_LIMIT_GENERAL", default="100/minute")
RATE_LIMIT_STRICT = config("RATE_LIMIT_STRICT", default="20/minute")
RATE_LIMIT_AUTH = config("RATE_LIMIT_AUTH", default="5/minute")

limiter = Limiter(key_func=get_remote_address)

def get_rate_limit_key(request: Request) -> str:
    if hasattr(request.state, 'user_id') and request.state.user_id:
        return f"user:{request.state.user_id}"
    
    return get_remote_address(request)

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    response = _rate_limit_exceeded_handler(request, exc)

    response.headers["X-RateLimit-Limit"] = str(exc.detail.split()[-1])
    response.headers["X-RateLimit-Remaining"] = "0"

    retry_after = "0"
    headers = getattr(exc, "headers", None)

    if headers and isinstance(headers, dict) and "Retry-After" in headers:
        retry_after = headers["Retry-After"]

    response.headers["X-RateLimit-Reset"] = retry_after
    response.headers["Retry-After"] = retry_after

    return response

def setup_rate_limiting(app):
    if RATE_LIMIT_ENABLED:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

        return limiter
    return None