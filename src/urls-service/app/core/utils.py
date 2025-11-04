import random
import string
import hashlib
import re

from sqlmodel import Session, select # type: ignore
from app.models.url import Url
from app.config import MAX_CUSTOM_URL_LENGTH, SHORT_CODE_LENGTH, RESERVED_SHORT_CODES

def generate_short_code_simple(length: int = SHORT_CODE_LENGTH) -> str:
    characters = string.ascii_letters + string.digits
    return "".join(random.choice(characters) for _ in range(length))

def generate_short_code_hash(url: str, length: int = SHORT_CODE_LENGTH) -> str:
    hash_object = hashlib.md5(url.encode())
    hex_dig = hash_object.hexdigest()
    
    characters = string.ascii_letters + string.digits
    result = ""

    for i in range(length):
        char_index = int(hex_dig[i % len(hex_dig)], 16) % len(characters)
        result += characters[char_index]

    return result

def is_code_reserved(code: str) -> bool:
    return code.lower() in RESERVED_SHORT_CODES

def generate_unique_short_code(session: Session, url: str, length: int = SHORT_CODE_LENGTH) -> str:
    short_code = generate_short_code_hash(url, length)
    if is_code_reserved(short_code):
        short_code = generate_short_code_simple(length)
    
    existing = session.exec(select(Url).where(Url.short_code == short_code)).first()
    if not existing:
        return short_code
    
    for attempt in range(10):
        short_code = generate_short_code_simple(length + attempt)
        if not is_code_reserved(short_code):
            existing = session.exec(select(Url).where(Url.short_code == short_code)).first()
            if not existing:
                return short_code
    
    raise ValueError("Could not generate unique short code")

def validate_url(url: str) -> bool:
    if not url:
        return False
    
    url_pattern = re.compile(
        r"^https?://"
        r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"
        r"localhost|"
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(?::\d+)?"
        r"(?:/?|[/?]\S+)$", re.IGNORECASE)
    
    return bool(url_pattern.match(url))

def validate_custom_code(code: str) -> bool:
    if not code:
        return False
    
    if len(code) < 4 or len(code) > MAX_CUSTOM_URL_LENGTH:
        return False
    
    if not re.match(r"^[a-zA-Z0-9_-]+$", code):
        return False
    
    if is_code_reserved(code):
        return False
    
    return True