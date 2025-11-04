import logging

from app.schemas.users import PasswordResetRequest, PasswordResetConfirmRequest
from app.crud.users import send_password_reset, reset_password_confirm

from fastapi import APIRouter, HTTPException, status, Request
from fastapi import Depends

from datetime import timedelta
from pydantic import ValidationError

from app.database import SessionDep
from app.schemas.users import (
    UserCreate, UserLogin, UserResponse, Token, UserUpdate,
    ResendActivationRequest, EmailActivationResponse
)

from app.crud.users import (
    create_user, authenticate_user, update_user, logout_user,
    UserAlreadyExistsError, InvalidCredentialsError, InvalidCurrentPasswordError,
    EmailNotVerifiedError, get_user_by_email, UserNotFoundError,
    activate_user_email, resend_activation_email, EmailSendCooldownError
)

from app.core.users import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.email import email_service
from app.api.dependencies import get_current_user

from app.models.user import User
from app.core.rate_limiting import limiter, RATE_LIMIT_AUTH

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/register", response_model=UserResponse)
@limiter.limit(RATE_LIMIT_AUTH)
def register(request: Request, user: UserCreate, session: SessionDep): # type: ignore
    try:
        return create_user(session=session, user=user)
    except UserAlreadyExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{e.field.capitalize()} '{e.value}' already registered"
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=Token)
@limiter.limit(RATE_LIMIT_AUTH)
def login(request: Request, user_credentials: UserLogin, session: SessionDep): # type: ignore
    try:
        user = authenticate_user(session, user_credentials.identifier, user_credentials.password)
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"user_id": str(user.id), "version": user.token_version},
            expires_delta=access_token_expires
        )
        
        return {"access_token": access_token, "token_type": "bearer"}
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except EmailNotVerifiedError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please verify your email address before logging in",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/me/update", response_model=UserResponse)
def update_user_profile(
    user_update: UserUpdate,
    session: SessionDep, # type: ignore
    current_user: User = Depends(get_current_user)
):
    try:
        return update_user(session=session, current_user=current_user, user_update=user_update)
    except UserAlreadyExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{e.field.capitalize()} '{e.value}' already taken"
        )
    except InvalidCurrentPasswordError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/logout")
def logout(
    session: SessionDep, # type: ignore
    current_user: User = Depends(get_current_user)
):
    logout_user(session=session, user=current_user)
    return {"message": "Successfully logged out"}

@router.post("/verify-token")
def verify_user_token(request: Request, current_user: User = Depends(get_current_user)):
    return {"message": "Token is valid", "user_id": current_user.id}

@router.get("/activate-email", response_model=EmailActivationResponse)
def activate_email(token: str, session: SessionDep): # type: ignore
    email = email_service.verify_email_activation_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired activation token"
        )
    
    try:
        user = activate_user_email(session, email)
        return EmailActivationResponse(
            message="Email successfully activated",
            success=True
        )
    except UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

@router.post("/resend-activation", response_model=EmailActivationResponse)
def resend_activation_email_endpoint(request: ResendActivationRequest, session: SessionDep): # type: ignore
    try:
        user = get_user_by_email(session, request.email)

        if user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already verified"
            )
        
        if resend_activation_email(session, user):
            return EmailActivationResponse(
                message="Activation email sent successfully"
            )
        
        return EmailActivationResponse(
                message="An unexpected error occurred while sending the email. Try again later."
            )
    except UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    except EmailSendCooldownError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "cooldown",
                "message": str(e),
                "remaining_minutes": e.remaining_minutes
            }
        )
    
@router.post("/password-reset-request")
def password_reset_request(request: PasswordResetRequest, session: SessionDep): # type: ignore
    try:
        send_password_reset(session, request.email)
        return {"message": "Password reset email sent"}
    except UserNotFoundError:
        return {"message": "Password reset email sent"}
    except EmailNotVerifiedError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is not verified")
    except EmailSendCooldownError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "cooldown",
                "message": str(e),
                "remaining_minutes": e.remaining_minutes
            }
        )
    except Exception as e:
        logger.error(f"Password reset request error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send password reset email")

@router.post("/password-reset-confirm")
def password_reset_confirm(request: PasswordResetConfirmRequest, session: SessionDep): # type: ignore
    try:
        UserCreate(password=request.new_password, email="test@example.com", username="testuser")
        reset_password_confirm(session, request.token, request.new_password)
        
        return {"message": "Password has been reset successfully"}
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except EmailNotVerifiedError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is not verified")
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Password reset confirm error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset password")