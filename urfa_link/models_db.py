from sqlalchemy import Column, String, Float, JSON, Integer, DateTime, Boolean
from datetime import datetime
from database import Base

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    tc_kimlik = Column(String, unique=True, index=True)
    phone = Column(String, unique=True, index=True)
    district = Column(String, index=True)
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

class MessageDB(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    content = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    timestamp = Column(DateTime, default=datetime.utcnow)

class MatchActionDB(Base):
    __tablename__ = "match_actions"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(String, index=True)
    target_id = Column(String, index=True)
    action = Column(String) # 'like' or 'pass'
    timestamp = Column(DateTime, default=datetime.utcnow)
