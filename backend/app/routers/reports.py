import uuid
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _get_date_cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _verify_report_access(user: models.User, target_user_id: uuid.UUID, db: DBSession) -> None:
    if target_user_id == user.id:
        return

    if user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver reportes de otros usuarios")

    if user.role == "supervisor":
        # Check if target_user_id is in any group supervised by the caller
        is_member = db.query(models.GroupMember).join(models.Group).filter(
            models.Group.supervisor_id == user.id,
            models.GroupMember.user_id == target_user_id
        ).first()
        if not is_member:
            raise HTTPException(status_code=403, detail="El usuario no pertenece a tus grupos supervisados")


@router.get("/summary", response_model=schemas.ReportSummary)
def get_summary(
    days: int = Query(default=7, ge=1, le=90),
    user_id: Optional[uuid.UUID] = None,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get aggregated report summary for the current user or a supervised worker."""
    target_user_id = user.id
    if user_id:
        _verify_report_access(user, user_id, db)
        target_user_id = user_id

    cutoff = _get_date_cutoff(days)

    sessions = db.query(models.Session).filter(
        models.Session.user_id == target_user_id,
        models.Session.started_at >= cutoff,
    ).all()

    total_alerts = sum(s.total_alerts for s in sessions)
    total_time = sum(s.duration_seconds for s in sessions)
    total_sessions = len(sessions)
    avg = round(total_alerts / total_sessions, 1) if total_sessions > 0 else 0

    return schemas.ReportSummary(
        total_alerts=total_alerts,
        total_sessions=total_sessions,
        total_time_seconds=total_time,
        avg_alerts_per_session=avg,
    )


@router.get("/sessions", response_model=List[schemas.SessionOut])
def get_sessions(
    days: int = Query(default=7, ge=1, le=90),
    user_id: Optional[uuid.UUID] = None,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get session history for the current user or a supervised worker."""
    target_user_id = user.id
    if user_id:
        _verify_report_access(user, user_id, db)
        target_user_id = user_id

    cutoff = _get_date_cutoff(days)
    sessions = db.query(models.Session).filter(
        models.Session.user_id == target_user_id,
        models.Session.started_at >= cutoff,
    ).order_by(models.Session.started_at.desc()).all()

    return [schemas.SessionOut.model_validate(s) for s in sessions]


@router.get("/events", response_model=List[schemas.EventOut])
def get_events(
    days: int = Query(default=7, ge=1, le=90),
    user_id: Optional[uuid.UUID] = None,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get event history for the current user or a supervised worker."""
    target_user_id = user.id
    if user_id:
        _verify_report_access(user, user_id, db)
        target_user_id = user_id

    cutoff = _get_date_cutoff(days)
    events = db.query(models.Event).filter(
        models.Event.user_id == target_user_id,
        models.Event.timestamp >= cutoff,
    ).order_by(models.Event.timestamp.desc()).all()

    return [schemas.EventOut.model_validate(e) for e in events]
