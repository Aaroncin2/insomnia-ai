import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="worker")  # worker | supervisor | admin
    created_at = Column(DateTime, default=func.now())

    sessions = relationship("Session", back_populates="user")
    events = relationship("Event", back_populates="user")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(DateTime, default=func.now())
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    total_alerts = Column(Integer, default=0)
    total_drowsy = Column(Integer, default=0)
    total_distracted = Column(Integer, default=0)
    total_yawns = Column(Integer, default=0)

    user = relationship("User", back_populates="sessions")
    events = relationship("Event", back_populates="session", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String, nullable=False)  # drowsy | sleeping | distracted | yawn
    timestamp = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="events")
    session = relationship("Session", back_populates="events")


class Group(Base):
    __tablename__ = "groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    code = Column(String(8), unique=True, nullable=False, index=True)
    supervisor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now())

    supervisor = relationship("User", foreign_keys=[supervisor_id])
    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = Column(DateTime, default=func.now())

    group = relationship("Group", back_populates="members")
    user = relationship("User")
