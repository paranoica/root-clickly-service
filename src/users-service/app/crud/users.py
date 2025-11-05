import re
import logging

from sqlmodel import Session, select # type: ignore
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.users import UserCreate, UserUpdate

from app.core.users import get_password_hash, verify_password
from app.core.email import email_service

from datetime import datetime, timedelta
from app.config import EMAIL_ACTIVATION_RESEND_COOLDOWN_MINUTES

logger = logging.getLogger(__name__)

class UserAlreadyExistsError(Exception):
    def __init__(self, field: str, value: str):
        self.field = field
        self.value = value

        super().__init__(f"{field.capitalize()} '{value}' already exists")

class UserNotFoundError(Exception):
    def __init__(self, identifier: str):
        self.identifier = identifier
        super().__init__(f"User with {identifier} not found")

class InvalidCredentialsError(Exception):
    def __init__(self):
        super().__init__("Invalid credentials")

class InvalidCurrentPasswordError(Exception):
    def __init__(self):
        super().__init__("Current password is incorrect")

class EmailNotVerifiedError(Exception):
    def __init__(self):
        super().__init__("Email is not verified")

class EmailSendCooldownError(Exception):
    def __init__(self, remaining_minutes: int, message: str = None):
        self.remaining_minutes = remaining_minutes

        if message is None:
            message = f"Please wait {remaining_minutes} minutes before requesting another email."

        super().__init__(message)

def is_email(identifier: str) -> bool:
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_pattern, identifier))

def create_user(session: Session, user: UserCreate) -> User:
    existing_user = session.exec(select(User).where(User.email == user.email)).first()
    if existing_user:
        raise UserAlreadyExistsError("email", user.email)
    
    existing_user = session.exec(select(User).where(User.username == user.username)).first()
    if existing_user:
        raise UserAlreadyExistsError("username", user.username)
    
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        email_verified=False,
        token_version=1
    )
    
    try:
        session.add(db_user)

        session.commit()
        session.refresh(db_user)
        
        success = email_service.send_activation_email(db_user.email, db_user.username)
        
        if success:
            db_user.last_email_sent = datetime.now()

            session.add(db_user)

            session.commit()
            session.refresh(db_user)
        else:
            logger.error(f"Failed to send activation email to: {user.email}")
        
        return db_user
    except Exception as e:
        logger.error(f"Error creating user {user.email}: {e}")
        session.rollback()

        raise

def update_user(session: Session, current_user: User, user_update: UserUpdate) -> User:
    if not verify_password(user_update.current_password, current_user.hashed_password):
        raise InvalidCurrentPasswordError()
    
    invalidate_tokens = False
    send_activation_email = False
    
    if user_update.email is not None and user_update.email != current_user.email:
        existing_user = session.exec(select(User).where(User.email == user_update.email)).first()

        if existing_user and existing_user.id != current_user.id:
            raise UserAlreadyExistsError("email", user_update.email)
        
        current_user.email = user_update.email
        current_user.email_verified = False

        invalidate_tokens = True
        send_activation_email = True
    
    if user_update.username is not None and user_update.username != current_user.username:
        existing_user = session.exec(select(User).where(User.username == user_update.username)).first()

        if existing_user and existing_user.id != current_user.id:
            raise UserAlreadyExistsError("username", user_update.username)
        
        current_user.username = user_update.username
    
    if user_update.password is not None:
        current_user.hashed_password = get_password_hash(user_update.password)
        invalidate_tokens = True
    
    if invalidate_tokens:
        current_user.token_version += 1

    current_user.updated_at = datetime.now()
    session.add(current_user)
    
    session.commit()
    session.refresh(current_user)
    
    if send_activation_email:
        email_service.send_activation_email(current_user.email, current_user.username)

    return current_user

def logout_user(session: Session, user: User) -> None:
    user.token_version += 1

    session.add(user)
    session.commit()

def get_user_by_email(session: Session, email: str) -> User:
    user = session.exec(select(User).where(User.email == email)).first()

    if not user:
        raise UserNotFoundError(f"email '{email}'")
    
    return user

def get_user_by_username(session: Session, username: str) -> User:
    user = session.exec(select(User).where(User.username == username)).first()

    if not user:
        raise UserNotFoundError(f"username '{username}'")
    
    return user

def get_user_by_id(session: Session, user_id: int) -> User:
    user = session.exec(select(User).where(User.id == user_id)).first()

    if not user:
        raise UserNotFoundError(f"id '{user_id}'")
    
    return user

def authenticate_user(session: Session, identifier: str, password: str) -> User:
    try:
        if is_email(identifier):
            user = get_user_by_email(session, identifier)
        else:
            user = get_user_by_username(session, identifier)
    except UserNotFoundError:
        raise InvalidCredentialsError()
    
    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()
    
    if not user.email_verified:
        raise EmailNotVerifiedError()
    
    return user

def get_user_by_email_optional(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()

def get_user_by_username_optional(session: Session, username: str) -> User | None:
    return session.exec(select(User).where(User.username == username)).first()

def get_user_by_id_optional(session: Session, user_id: int) -> User | None:
    return session.exec(select(User).where(User.id == user_id)).first()

def activate_user_email(session: Session, email: str) -> User:
    user = get_user_by_email(session, email)

    user.email_verified = True
    user.updated_at = datetime.now()

    session.add(user)
    session.commit()
    session.refresh(user)

    return user

def can_send_email(session: Session, user: User) -> bool:
    if user.last_email_sent is None:
        return True
    
    cooldown_time = user.last_email_sent + timedelta(minutes=EMAIL_ACTIVATION_RESEND_COOLDOWN_MINUTES)
    return datetime.now() > cooldown_time

def get_email_cooldown_remaining(session: Session, user: User) -> int:
    if user.last_email_sent is None:
        return 0
    
    cooldown_time = user.last_email_sent + timedelta(minutes=EMAIL_ACTIVATION_RESEND_COOLDOWN_MINUTES)
    remaining = cooldown_time - datetime.now()

    if remaining.total_seconds() <= 0:
        return 0
    
    return int(remaining.total_seconds() / 60) + 1

def mark_email_sent(session: Session, user: User):
    user.last_email_sent = datetime.now()

    session.add(user)
    session.commit()

def resend_activation_email(session: Session, user: User) -> bool:
    if not can_send_email(session, user):
        remaining = get_email_cooldown_remaining(session, user)
        raise EmailSendCooldownError(remaining, "Please wait before requesting another activation email.")
    
    success = email_service.send_activation_email(user.email, user.username)
    if not success:
        logger.error(f"Could not resend activation email to user: {user.email}")
        return False
    
    mark_email_sent(session, user)
    return True

def send_password_reset(session: Session, email: str) -> None:
    user = get_user_by_email(session, email)

    if not user.email_verified:
        raise EmailNotVerifiedError()
    
    if not can_send_email(session, user):
        remaining = get_email_cooldown_remaining(session, user)
        raise EmailSendCooldownError(remaining, "Please wait before requesting another password reset email.")
    
    success = email_service.send_password_reset_email(user.email, user.username, user.token_version)
    if not success:
        logger.error(f"Could not send password reset email to user: {user.email}")
        raise Exception("Failed to send password reset email")
    
    mark_email_sent(session, user)

def reset_password_confirm(session: Session, token: str, new_password: str) -> None:
    payload = email_service.verify_password_reset_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired password reset token")
    
    email = payload.get("email")
    token_version = payload.get("token_version")

    if not email or token_version is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password reset token")
    
    user = get_user_by_email(session, email)
    if not user.email_verified:
        raise EmailNotVerifiedError()
    
    if user.token_version != token_version:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The password reset link has expired. Request a new one")
    
    user.hashed_password = get_password_hash(new_password)
    user.token_version += 1
    user.updated_at = datetime.now()
    
    session.add(user)
    session.commit()