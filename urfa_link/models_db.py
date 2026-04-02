from sqlalchemy import Column, String, Float, JSON, Integer, DateTime, Boolean
from datetime import datetime
from database import Base

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True)
    district = Column(String, index=True, nullable=True)
    education = Column(String)
    
    bio = Column(String)
    hashed_password = Column(String)
    
    # Store List[float] as JSON string in SQLite
    interest_vector = Column(JSON)
    
    latitude = Column(Float)
    longitude = Column(Float)
    reset_otp = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)
    email = Column(String, nullable=True)
    login_otp = Column(String, nullable=True)
    login_otp_expires = Column(DateTime, nullable=True)
    
    # New features
    daily_status = Column(String, nullable=True)
    status_updated_at = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, default=datetime.utcnow)

class MessageDB(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    content = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    # Read receipts
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)

class MatchActionDB(Base):
    __tablename__ = "match_actions"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(String, index=True)
    target_id = Column(String, index=True)
    action = Column(String) # 'like' or 'pass'
    timestamp = Column(DateTime, default=datetime.utcnow)

class BlockDB(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(String, index=True)
    blocked_id = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
