import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Get the URL from environment
raw_url = os.getenv("DATABASE_URL", "sqlite:///./urfa_link.db")

# Render sometimes prefixes with https:// if it's a web service URL by mistake, or postgres:// 
# SQLAlchemy specifically needs postgresql:// for psycopg2
if raw_url.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = raw_url.replace("postgres://", "postgresql://", 1)
elif raw_url.startswith("https://"):
    # If Render somehow passed a web URL instead of DB URL, fallback to sqlite to prevent crash,
    # or print a clear error. We'll fallback to sqlite for safety but log it.
    print("WARNING: DATABASE_URL is an https string. Falling back to SQLite.")
    SQLALCHEMY_DATABASE_URL = "sqlite:///./urfa_link.db"
else:
    SQLALCHEMY_DATABASE_URL = raw_url

# Only use check_same_thread for SQLite
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
