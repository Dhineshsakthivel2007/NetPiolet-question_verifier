"""Auth service — password hashing, JWT tokens, user authentication."""

from __future__ import annotations
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session
from app.config import settings
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, Exception):
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def authenticate_users(db: Session, username_or_roll: str, password: str) -> list[User]:
    if not username_or_roll or not username_or_roll.strip():
        return []
    val = username_or_roll.strip()
    from sqlalchemy import func
    users = db.query(User).filter(
        (func.lower(User.roll_number) == val.lower()) |
        (func.lower(User.email) == val.lower()) |
        (func.lower(User.username) == val.lower())
    ).all()

    valid_users = []
    for user in users:
        if verify_password(password, user.hashed_password):
            valid_users.append(user)
    return valid_users


def authenticate_user(db: Session, username_or_roll: str, password: str) -> User | None:
    users = authenticate_users(db, username_or_roll, password)
    return users[0] if users else None


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()
