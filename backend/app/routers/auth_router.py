from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from .. import models, schemas
from ..database import get_db
from ..auth import hash_password, verify_password, create_access_token
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: DBSession = Depends(get_db)):
    # Check if email exists
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    user = models.User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role="worker",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user))


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.UserLogin, db: DBSession = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_access_token({"sub": str(user.id)})
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def get_me(user: models.User = Depends(get_current_user)):
    return schemas.UserOut.model_validate(user)
