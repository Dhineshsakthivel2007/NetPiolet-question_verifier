"""Topic API routes."""


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas import TopicCreate, TopicUpdate, TopicResponse
from app.services import topic_service

router = APIRouter(prefix="/topics", tags=["Topics"])


@router.get("", response_model=list[TopicResponse])
def list_topics(level_id: str | None = None, db: Session = Depends(get_db)):
    return topic_service.get_topics(db, level_id=level_id)


@router.post("", response_model=TopicResponse, status_code=201)
def create_topic(data: TopicCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = topic_service.create_topic(db, data)
    from app.services.audit_service import log_activity
    log_activity(db, "TOPIC_CREATED", user.username, role=str(user.role.value if hasattr(user.role, 'value') else user.role), details=f"Created topic '{t.name}'")
    return t


@router.get("/{topic_id}", response_model=TopicResponse)
def get_topic(topic_id: str, db: Session = Depends(get_db)):
    topic = topic_service.get_topic(db, topic_id)
    if not topic: raise HTTPException(404, "Topic not found")
    return topic


@router.put("/{topic_id}", response_model=TopicResponse)
def update_topic(topic_id: str, data: TopicUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    topic = topic_service.update_topic(db, topic_id, data)
    if not topic: raise HTTPException(404, "Topic not found")
    return topic


@router.delete("/{topic_id}", status_code=204)
def delete_topic(topic_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    top = topic_service.get_topic(db, topic_id)
    tname = top.name if top else topic_id
    if not topic_service.delete_topic(db, topic_id): raise HTTPException(404, "Topic not found")
    from app.services.audit_service import log_activity
    log_activity(db, "TOPIC_DELETED", user.username, role=str(user.role.value if hasattr(user.role, 'value') else user.role), details=f"Deleted topic '{tname}'")
