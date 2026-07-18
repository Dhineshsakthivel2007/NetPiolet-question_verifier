"""Auth API routes — login, register, Google OAuth, admin user management."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user, require_admin
from app.models.user import User, UserRole
from app.schemas import (
    GoogleLoginRequest, TokenResponse, UserApproveRequest,
    UserCreate, UserLogin, UserResponse, UserRoleRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    """Register a new account. Account is inactive until admin approves."""
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    role = UserRole.student
    if data.role in ("admin", "professor"):
        role = UserRole(data.role)

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=auth_service.hash_password(data.password),
        role=role,
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Account created. Please wait for admin approval to login.", "user_id": user.id}


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """Login and receive JWT token."""
    user = auth_service.authenticate_user(db, data.username, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is pending admin approval. Please contact the administrator.")
    token = auth_service.create_access_token({"sub": str(user.id), "username": user.username, "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value, username=user.username)


@router.post("/google", response_model=TokenResponse)
def google_login(data: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Login via Google OAuth. Only @bitsathy.ac.in emails allowed."""
    # Verify the Google ID token
    try:
        resp = httpx.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={data.id_token}", timeout=10)
        if resp.status_code != 200:
            raise ValueError("Invalid Google token")
        payload = resp.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Google token. Please try again.")

    email = payload.get("email", "")
    if not email.endswith(f"@{settings.allowed_email_domain}"):
        raise HTTPException(status_code=403, detail=f"Only @{settings.allowed_email_domain} emails are allowed")

    google_id = payload.get("sub", "")
    name = payload.get("name", email.split("@")[0])
    avatar = payload.get("picture", "")

    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = db.query(User).filter(User.google_id == google_id).first()

    if not user:
        # Create new user (inactive by default)
        username = email.split("@")[0]
        # Ensure unique username
        base = username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base}{counter}"
            counter += 1

        user = User(
            username=username,
            email=email,
            google_id=google_id,
            avatar_url=avatar,
            role=UserRole.student,
            is_active=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        raise HTTPException(status_code=403, detail="Account created. Please wait for admin approval.")
    else:
        # Update google info
        if not user.google_id:
            user.google_id = google_id
        if avatar:
            user.avatar_url = avatar
        db.commit()

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account is pending admin approval. Please contact the administrator.")

    token = auth_service.create_access_token({"sub": str(user.id), "username": user.username, "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value, username=user.username)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return current_user


# ---- Admin: User Management ----

@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """List all users (admin only)."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.put("/users/{user_id}/approve")
def approve_user(user_id: str, data: UserApproveRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Approve or deactivate a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own status")
    user.is_active = data.is_active
    db.commit()
    return {"message": f"User {'approved' if data.is_active else 'deactivated'}", "user_id": user.id}


@router.put("/users/{user_id}/role")
def change_role(user_id: str, data: UserRoleRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Change a user's role (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        user.role = UserRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be: admin, professor, student")
    db.commit()
    return {"message": f"Role changed to {data.role}", "user_id": user.id}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}
