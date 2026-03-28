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
