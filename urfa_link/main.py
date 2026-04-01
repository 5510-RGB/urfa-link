# Urfa-Link Backend v1.1 - CORS fixed
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import users, messages, admin
from database import engine, Base
import models_db

# Create database tables
Base.metadata.create_all(bind=engine)

# Runtime migration: Add new columns if they don't exist
def run_migrations():
    try:
        with engine.connect() as conn:
            # PostgreSQL supports IF NOT EXISTS
            from sqlalchemy import text
            migrations = [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_otp VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_otp_expires TIMESTAMP",
            ]
            for sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception as e:
                    # Column may already exist (SQLite) or other non-fatal error
                    print(f"Migration note: {e}")
    except Exception as e:
        print(f"Migration error: {e}")

run_migrations()

app = FastAPI(
    title="Urfa-Link API",
    description="High-performance social networking project based on Anti-Gravity Core v2.0",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(messages.router)
app.include_router(admin.router)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

@app.get("/style.css")
async def get_style():
    return FileResponse("static/style.css")

@app.get("/app.js")
async def get_app_js():
    return FileResponse("static/app.js")

if __name__ == "__main__":
    import uvicorn
    # run with `python main.py` or `uvicorn main:app --reload`
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
