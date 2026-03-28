from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import users, messages, admin
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
