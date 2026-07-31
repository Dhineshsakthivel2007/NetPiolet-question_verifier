"""Level API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas import LevelCreate, LevelUpdate, LevelResponse
from app.services import level_service

router = APIRouter(prefix="/levels", tags=["Levels"])


@router.get("", response_model=list[LevelResponse])
def list_levels(db: Session = Depends(get_db)):
    return level_service.get_levels(db)


@router.post("", response_model=LevelResponse, status_code=201)
def create_level(data: LevelCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return level_service.create_level(db, data)


@router.get("/{level_id}", response_model=LevelResponse)
def get_level(level_id: str, db: Session = Depends(get_db)):
    level = level_service.get_level(db, level_id)
    if not level: raise HTTPException(404, "Level not found")
    return level


@router.put("/{level_id}", response_model=LevelResponse)
def update_level(level_id: str, data: LevelUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    level = level_service.update_level(db, level_id, data)
    if not level: raise HTTPException(404, "Level not found")
    return level


@router.delete("/{level_id}", status_code=204)
def delete_level(level_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not level_service.delete_level(db, level_id): raise HTTPException(404, "Level not found")
