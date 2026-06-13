import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from typing import List
from datetime import datetime, timezone
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=schemas.SessionOut)
def create_session(user: models.User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Start a new detection session."""
    session = models.Session(user_id=user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return schemas.SessionOut.model_validate(session)


@router.put("/{session_id}", response_model=schemas.SessionOut)
def end_session(
    session_id: uuid.UUID,
    data: schemas.SessionEnd,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """End a detection session with final stats."""
    session = db.query(models.Session).filter(
        models.Session.id == session_id,
        models.Session.user_id == user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.ended_at = datetime.now(timezone.utc)
    session.duration_seconds = data.duration_seconds
    session.total_alerts = data.total_alerts
    session.total_drowsy = data.total_drowsy
    session.total_distracted = data.total_distracted
    session.total_yawns = data.total_yawns

    db.commit()
    db.refresh(session)
    return schemas.SessionOut.model_validate(session)


@router.post("/events", response_model=schemas.EventOut)
def create_event(
    data: schemas.EventCreate,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Record a detection event (drowsy, sleeping, distracted, yawn)."""
    # Verify session belongs to user
    session = db.query(models.Session).filter(
        models.Session.id == data.session_id,
        models.Session.user_id == user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    valid_types = {"drowsy", "sleeping", "distracted", "yawn"}
    if data.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Usar: {valid_types}")

    event = models.Event(
        user_id=user.id,
        session_id=data.session_id,
        type=data.type,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return schemas.EventOut.model_validate(event)
