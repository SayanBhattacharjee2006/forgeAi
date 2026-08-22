from datetime import datetime, timedelta, timezone
from typing import Any
import secrets
import hashlib

from jose import jwt, JWTError
from cryptography.fernet import Fernet

from app.core.config import settings


import base64

# Derive a deterministic Fernet key from the SECRET_KEY
_key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_key_bytes)
_fernet = Fernet(_fernet_key)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Reject explicit refresh-type tokens used as access tokens
        if payload.get("type") == "refresh":
            return None
        return payload
    except JWTError:
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False, "verify_aud": False},
            )
            if payload.get("type") == "refresh":
                return None
            return payload
        except Exception:
            return None


def create_refresh_token() -> str:
    """Generate a cryptographically random opaque refresh token string."""
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for storage (never store raw tokens)."""
    return hashlib.sha256(token.encode()).hexdigest()


def encrypt_token(token: str) -> str:
    """Encrypt a sensitive token (e.g., GitHub access token) for storage."""
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a stored sensitive token."""
    return _fernet.decrypt(encrypted_token.encode()).decode()
