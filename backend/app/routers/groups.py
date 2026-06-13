import string
import random
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession, joinedload
from typing import List
from datetime import datetime, timedelta, timezone
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _generate_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


# ── Worker: join group ───────────────────────────────

@router.post("/join", response_model=schemas.GroupMemberOut)
def join_group(
    data: schemas.JoinGroupRequest,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Worker joins a group using its code."""
    group = db.query(models.Group).filter(models.Group.code == data.code.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Código de grupo no encontrado")

    # Check if already a member
    existing = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group.id,
        models.GroupMember.user_id == user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya eres miembro de este grupo")

    member = models.GroupMember(group_id=group.id, user_id=user.id)
    db.add(member)
    db.commit()
    db.refresh(member)

    return schemas.GroupMemberOut(
        id=member.id,
        user_id=member.user_id,
        group_id=member.group_id,
        full_name=user.full_name,
        joined_at=member.joined_at,
        group_name=group.name,
    )


@router.get("/my-groups", response_model=List[schemas.GroupOut])
def get_my_groups(
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get all groups the current user belongs to."""
    memberships = db.query(models.GroupMember).options(
        joinedload(models.GroupMember.group).joinedload(models.Group.supervisor)
    ).filter(
        models.GroupMember.user_id == user.id
    ).all()

    groups = []
    for m in memberships:
        group = m.group
        if group:
            sup_name = group.supervisor.full_name if group.supervisor else None
            groups.append(schemas.GroupOut(
                id=group.id, name=group.name, code=group.code,
                supervisor_id=group.supervisor_id, supervisor_name=sup_name,
                created_at=group.created_at,
            ))
    return groups


# ── Supervisor: group analytics ──────────────────────

@router.get("/supervised", response_model=List[schemas.GroupOut])
def get_supervised_groups(
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """Get groups supervised by the current user."""
    groups = db.query(models.Group).filter(models.Group.supervisor_id == user.id).all()
    result = []
    for g in groups:
        result.append(schemas.GroupOut(
            id=g.id, name=g.name, code=g.code,
            supervisor_id=g.supervisor_id, supervisor_name=user.full_name,
            created_at=g.created_at,
        ))
    return result


@router.get("/{group_id}/members", response_model=List[schemas.GroupMemberOut])
def get_group_members(
    group_id: uuid.UUID,
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """Get all members of a group."""
    # Verify access: must be supervisor of group or admin
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if user.role != "admin" and group.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")

    members = db.query(models.GroupMember).options(
        joinedload(models.GroupMember.user)
    ).filter(models.GroupMember.group_id == group_id).all()
    result = []
    for m in members:
        result.append(schemas.GroupMemberOut(
            id=m.id, user_id=m.user_id, group_id=m.group_id,
            full_name=m.user.full_name if m.user else None, joined_at=m.joined_at,
            group_name=group.name,
        ))
    return result


@router.get("/{group_id}/sessions", response_model=List[schemas.SessionOut])
def get_group_sessions(
    group_id: uuid.UUID,
    days: int = Query(default=7, ge=1, le=90),
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """Get all sessions from members of a group."""
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if user.role != "admin" and group.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")

    member_ids = [m.user_id for m in db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()]

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = db.query(models.Session).filter(
        models.Session.user_id.in_(member_ids),
        models.Session.started_at >= cutoff,
    ).order_by(models.Session.started_at.desc()).all()

    return [schemas.SessionOut.model_validate(s) for s in sessions]


@router.get("/{group_id}/events", response_model=List[schemas.EventOut])
def get_group_events(
    group_id: uuid.UUID,
    days: int = Query(default=7, ge=1, le=90),
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """Get all events from members of a group."""
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if user.role != "admin" and group.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")

    member_ids = [m.user_id for m in db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()]

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    events = db.query(models.Event).filter(
        models.Event.user_id.in_(member_ids),
        models.Event.timestamp >= cutoff,
    ).order_by(models.Event.timestamp.desc()).all()

    return [schemas.EventOut.model_validate(e) for e in events]


@router.delete("/{group_id}/members/{user_id}")
def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Remove a member from a group."""
    # If not supervisor/admin, the user can only remove themselves
    if user.role not in ["supervisor", "admin"] and user.id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para remover a este miembro")

    if user.role != "admin" and user.id != user_id:
        group = db.query(models.Group).filter(models.Group.id == group_id).first()
        if not group or group.supervisor_id != user.id:
            raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")

    member = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    db.delete(member)
    db.commit()
    return {"detail": "Miembro removido"}
