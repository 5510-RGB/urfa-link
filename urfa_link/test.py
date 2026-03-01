
import sys
import traceback
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
from models_db import UserDB
import routers.users as users_router
from models import LoginRequest
import asyncio

engine = create_engine('sqlite:///./urfa_link.db')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

request = LoginRequest(tc_kimlik='12345678901', password='password')

async def test_login():
    try:
        res = await users_router.login_user(request, db)
        print(res)
    except Exception as e:
        with open('error.log', 'w') as f:
            traceback.print_exc(file=f)

asyncio.run(test_login())

