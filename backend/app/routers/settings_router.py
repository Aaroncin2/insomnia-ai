import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "earThreshold": 0.25,
    "earConsecutiveFrames": 20,
    "marThreshold": 0.60,
    "yawThreshold": 25,
    "pitchThreshold": 20,
    "distractionConsecutiveFrames": 15,
}


@router.get("/my-settings", response_model=schemas.ThresholdSettings)
def get_my_settings(
    user: models.User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get effective threshold settings for the current user.
    Priority:
    1. User's specific settings (if set)
    2. Group settings (if user belongs to a group with group settings)
    3. Default system settings
    """
    # 1. User specific settings
    if user.settings:
        try:
            parsed = json.loads(user.settings)
            return schemas.ThresholdSettings(**{**DEFAULT_SETTINGS, **parsed})
        except Exception:
            pass

    # 2. Group settings
    memberships = db.query(models.GroupMember).filter(models.GroupMember.user_id == user.id).all()
    for m in memberships:
        group = db.query(models.Group).filter(models.Group.id == m.group_id).first()
        if group and group.settings:
            try:
                parsed = json.loads(group.settings)
                return schemas.ThresholdSettings(**{**DEFAULT_SETTINGS, **parsed})
            except Exception:
                pass

    # 3. Default
    return schemas.ThresholdSettings(**DEFAULT_SETTINGS)


@router.put("/my-settings", response_model=schemas.ThresholdSettings)
def update_my_settings(
    data: schemas.ThresholdSettings,
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """
    Supervisor or Admin updates their own default settings.
    """
    user.settings = json.dumps(data.model_dump())
    db.commit()
    db.refresh(user)
    return data


@router.put("/group/{group_id}", response_model=schemas.ThresholdSettings)
def update_group_settings(
    group_id: uuid.UUID,
    data: schemas.ThresholdSettings,
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """
    Supervisor or Admin updates threshold settings for an entire group of workers.
    """
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    if user.role != "admin" and group.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso para modificar la configuración de este grupo")

    group.settings = json.dumps(data.model_dump())
    db.commit()
    db.refresh(group)
    return data


@router.put("/user/{user_id}", response_model=schemas.ThresholdSettings)
def update_user_settings(
    user_id: uuid.UUID,
    data: schemas.ThresholdSettings,
    user: models.User = Depends(require_role("supervisor", "admin")),
    db: DBSession = Depends(get_db),
):
    """
    Supervisor or Admin updates threshold settings for a specific worker user.
    """
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target_user.settings = json.dumps(data.model_dump())
    db.commit()
    db.refresh(target_user)
    return data
