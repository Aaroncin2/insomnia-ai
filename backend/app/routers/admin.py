import string
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from typing import List
from .. import models, schemas
from ..database import get_db
from ..dependencies import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _generate_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


# ── Users ────────────────────────────────────────────

@router.get("/users", response_model=List[schemas.UserOut])
def list_users(
    user: models.User = Depends(require_role("admin")),
    db: DBSession = Depends(get_db),
):
    """List all users."""
    users = db.query(models.User).order_by(models.User.created_at).all()
    return [schemas.UserOut.model_validate(u) for u in users]


@router.put("/users/{user_id}/role", response_model=schemas.UserOut)
def update_role(
    user_id: str,
    data: schemas.RoleUpdate,
    user: models.User = Depends(require_role("admin")),
    db: DBSession = Depends(get_db),
):
    """Update a user's role. Cannot change own role."""
    if str(user.id) == user_id:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")

    valid_roles = {"worker", "supervisor", "admin"}
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Usar: {valid_roles}")

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target.role = data.role
    db.commit()
    db.refresh(target)
    return schemas.UserOut.model_validate(target)


# ── Groups ───────────────────────────────────────────

@router.get("/groups", response_model=List[schemas.GroupOut])
def list_groups(
    user: models.User = Depends(require_role("admin")),
    db: DBSession = Depends(get_db),
):
    """List all groups."""
    groups = db.query(models.Group).order_by(models.Group.created_at).all()
    result = []
    for g in groups:
        sup_name = None
        if g.supervisor_id:
            sup = db.query(models.User).filter(models.User.id == g.supervisor_id).first()
            sup_name = sup.full_name if sup else None
        result.append(schemas.GroupOut(
            id=g.id, name=g.name, code=g.code,
            supervisor_id=g.supervisor_id, supervisor_name=sup_name,
            created_at=g.created_at,
        ))
    return result


@router.post("/groups", response_model=schemas.GroupOut)
def create_group(
    data: schemas.GroupCreate,
    user: models.User = Depends(require_role("admin")),
    db: DBSession = Depends(get_db),
):
    """Create a new group."""
    # Generate unique code
    for _ in range(10):
        code = _generate_code()
        if not db.query(models.Group).filter(models.Group.code == code).first():
            break
    else:
        raise HTTPException(status_code=500, detail="No se pudo generar código único")

    group = models.Group(
        name=data.name,
        code=code,
        supervisor_id=data.supervisor_id,
        created_by=user.id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    sup_name = None
    if group.supervisor_id:
        sup = db.query(models.User).filter(models.User.id == group.supervisor_id).first()
        sup_name = sup.full_name if sup else None

    return schemas.GroupOut(
        id=group.id, name=group.name, code=group.code,
        supervisor_id=group.supervisor_id, supervisor_name=sup_name,
        created_at=group.created_at,
    )


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: str,
    user: models.User = Depends(require_role("admin")),
    db: DBSession = Depends(get_db),
):
    """Delete a group."""
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db.delete(group)
    db.commit()
    return {"detail": "Grupo eliminado"}
