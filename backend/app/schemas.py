import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional


# ── Auth ──────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str]
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Sessions ─────────────────────────────────────────

class SessionCreate(BaseModel):
    """Client sends this to start a session."""
    pass  # No fields needed, server sets started_at


class SessionEnd(BaseModel):
    """Client sends this to end a session."""
    duration_seconds: int
    total_alerts: int = 0
    total_drowsy: int = 0
    total_distracted: int = 0
    total_yawns: int = 0


class SessionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: int
    total_alerts: int
    total_drowsy: int
    total_distracted: int
    total_yawns: int

    class Config:
        from_attributes = True


# ── Events ───────────────────────────────────────────

class EventCreate(BaseModel):
    session_id: uuid.UUID
    type: str  # drowsy | sleeping | distracted | yawn


class EventOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    type: str
    timestamp: datetime

    class Config:
        from_attributes = True


# ── Groups ───────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    supervisor_id: Optional[uuid.UUID] = None


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    supervisor_id: Optional[uuid.UUID]
    supervisor_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class GroupMemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    group_id: uuid.UUID
    full_name: Optional[str] = None
    joined_at: datetime

    class Config:
        from_attributes = True


class JoinGroupRequest(BaseModel):
    code: str


# ── Admin ────────────────────────────────────────────

class RoleUpdate(BaseModel):
    role: str  # worker | supervisor | admin


# ── Reports ──────────────────────────────────────────

class ReportSummary(BaseModel):
    total_alerts: int
    total_sessions: int
    total_time_seconds: int
    avg_alerts_per_session: float
