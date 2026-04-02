from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, HTTPException
from typing import Dict, List
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
import models_db
import os
import uuid

router = APIRouter(prefix="/messages", tags=["Messages"])

# In-memory dictionary to hold active websocket connections
# Format: { "user_uuid": WebSocket }
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, sender_id: str, receiver_id: str, sender_name: str = "Bilinmeyen", sender_image: str | None = None):
        # We send a JSON string to the receiver if they are online
        if receiver_id in self.active_connections:
            websocket = self.active_connections[receiver_id]
            await websocket.send_json({
                "sender_id": sender_id,
                "sender_name": sender_name,
                "sender_image": sender_image,
                "content": message
            })
        else:
            print(f"Receiver {receiver_id} offline. Queued in DB.")
            
    async def send_raw_json(self, payload: dict, receiver_id: str):
        if receiver_id in self.active_connections:
            websocket = self.active_connections[receiver_id]
            await websocket.send_json(payload)

manager = ConnectionManager()

@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(client_id, websocket)
    try:
        while True:
            # Wait for any message from the client
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # Data expected: {"receiver_id": "...", "content": "..."}
            receiver_id = data.get("receiver_id")
            content = data.get("content")
            action = data.get("action")
            
            if action == "seen":
                msg_id = data.get("message_id")
                sender_to_notify = data.get("sender_id")
                if msg_id and sender_to_notify:
                    db = SessionLocal()
                    try:
                        msg = db.query(models_db.MessageDB).filter(models_db.MessageDB.id == msg_id).first()
                        if msg and msg.receiver_id == client_id:
                            msg.is_read = True
                            import datetime
                            msg.read_at = datetime.datetime.utcnow()
                            db.commit()
                            await manager.send_raw_json({"action": "read_receipt", "message_id": msg_id}, sender_to_notify)
                    except Exception as e:
                        print(e)
                    finally:
                        db.close()
                continue

            if receiver_id and content:
                # 1. Save to Database with a short-lived session
                db = SessionLocal()
                sender_name = "Bilinmeyen"
                sender_image = None
                try:
                    sender = db.query(models_db.UserDB).filter(models_db.UserDB.id == client_id).first()
                    if sender:
                        sender_name = sender.name
                        sender_image = sender.profile_image
                        
                    new_msg = models_db.MessageDB(
                        sender_id=client_id,
                        receiver_id=receiver_id,
                        content=content
                    )
                    db.add(new_msg)
                    db.commit()
                except Exception as e:
                    print(f"WebSocket DB Save Error: {e}")
                finally:
                    db.close()

                # 2. Try to send in real-time if receiver is online
                await manager.send_personal_message(content, client_id, receiver_id, sender_name, sender_image)

    except WebSocketDisconnect:
        manager.disconnect(client_id)

from pydantic import BaseModel

class SendMessageRequest(BaseModel):
    content: str

@router.post("/{sender_id}/{receiver_id}/text")
async def send_text_message(
    sender_id: str,
    receiver_id: str,
    payload: SendMessageRequest,
    db: Session = Depends(get_db)
):
    # Verify users exist
    sender = db.query(models_db.UserDB).filter(models_db.UserDB.id == sender_id).first()
    receiver = db.query(models_db.UserDB).filter(models_db.UserDB.id == receiver_id).first()
    if not sender or not receiver:
        raise HTTPException(status_code=404, detail="Sender or receiver not found")

    if not payload.content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    # 1. Save to Database
    new_msg = models_db.MessageDB(
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=payload.content
    )
    db.add(new_msg)
    db.commit()

    # 2. Try to send in real-time
    await manager.send_raw_json({
        "action": "new_message",
        "message_id": new_msg.id,
        "sender_id": sender_id,
        "sender_name": sender.name,
        "sender_image": sender.profile_image,
        "content": payload.content
    }, receiver_id)

    return {"status": "ok", "content": payload.content, "message_id": new_msg.id}

@router.post("/{sender_id}/{receiver_id}/upload-image")
async def upload_chat_image(
    sender_id: str, 
    receiver_id: str, 
    is_one_time: bool = False,
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    upload_dir = "static/uploads/chats"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)

    # Generate a unique filename
    file_extension = file.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"{upload_dir}/{unique_filename}"

    # Verify users exist
    sender = db.query(models_db.UserDB).filter(models_db.UserDB.id == sender_id).first()
    receiver = db.query(models_db.UserDB).filter(models_db.UserDB.id == receiver_id).first()
    if not sender or not receiver:
        raise HTTPException(status_code=404, detail="Sender or receiver not found")

    # Save the file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

    # Format the message content
    image_url = f"/{file_path}"
    message_content = f"[IMAGE]:{image_url}"
    if is_one_time:
        message_content = f"[ONETIMEIMAGE]:{image_url}"

    # 1. Save to Database
    new_msg = models_db.MessageDB(
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=message_content
    )
    db.add(new_msg)
    db.commit()

    # 2. Try to send in real-time
    await manager.send_raw_json({
        "action": "new_message",
        "message_id": new_msg.id,
        "sender_id": sender_id,
        "sender_name": sender.name,
        "sender_image": sender.profile_image,
        "content": message_content
    }, receiver_id)

    return {"message": "Image uploaded successfully", "content": message_content, "message_id": new_msg.id}

@router.get("/status/{user_id}")
async def get_user_status(user_id: str):
    # manager is defined above: manager = ConnectionManager()
    is_online = user_id in manager.active_connections
    return {"user_id": user_id, "is_online": is_online}

@router.get("/history/{user_id}/{peer_id}")
def get_chat_history(user_id: str, peer_id: str, db: Session = Depends(get_db)):
    # Fetch messages where (sender=user AND receiver=peer) OR (sender=peer AND receiver=user) -> Order by timestamp
    messages = db.query(models_db.MessageDB).filter(
        (
            (models_db.MessageDB.sender_id == user_id) & (models_db.MessageDB.receiver_id == peer_id)
        ) | (
            (models_db.MessageDB.sender_id == peer_id) & (models_db.MessageDB.receiver_id == user_id)
        )
    ).order_by(models_db.MessageDB.timestamp.asc()).all()

    return messages
@router.get("/active_chats/{user_id}")
def get_active_chats(user_id: str, db: Session = Depends(get_db)):
    # Find all unique users this user has sent messages to OR received messages from
    sent_to = db.query(models_db.MessageDB.receiver_id).filter(models_db.MessageDB.sender_id == user_id).distinct()
    received_from = db.query(models_db.MessageDB.sender_id).filter(models_db.MessageDB.receiver_id == user_id).distinct()
    
    # Combine and get unique peer IDs
    peer_ids = set([r[0] for r in sent_to] + [r[0] for r in received_from])
    
    if not peer_ids:
        return []

    # Fetch user details for those peers
    peers = db.query(models_db.UserDB).filter(models_db.UserDB.id.in_(peer_ids)).all()
    
    # Return basic info
    return [{"id": p.id, "name": p.name} for p in peers]
