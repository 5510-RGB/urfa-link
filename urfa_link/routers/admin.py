from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models_db

router = APIRouter(
    prefix="/admin",
    tags=["admin"]
)

def check_admin(admin_id: str, db: Session):
    admin_user = db.query(models_db.UserDB).filter(models_db.UserDB.id == admin_id).first()
    if not admin_user or not admin_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işleme yetkiniz yok."
        )
    return admin_user

@router.get("/stats/{admin_id}")
async def get_stats(admin_id: str, db: Session = Depends(get_db)):
    check_admin(admin_id, db)
    
    total_users = db.query(models_db.UserDB).count()
    total_messages = db.query(models_db.MessageDB).count()
    
    # Her bir mutual beğeni için 2 action vardır, o yüzden 2'ye bölebiliriz.
    total_matches = db.query(models_db.MatchActionDB).filter(models_db.MatchActionDB.action == 'like').count() // 2
    
    return {
        "total_users": total_users,
        "total_matches": total_matches,
        "total_messages": total_messages
    }

@router.get("/users/{admin_id}")
async def list_users(admin_id: str, db: Session = Depends(get_db)):
    check_admin(admin_id, db)
    users = db.query(models_db.UserDB).all()
    user_list = [
        {"id": u.id, "name": u.name, "tc_kimlik": u.tc_kimlik, "is_admin": u.is_admin}
        for u in users
    ]
    return user_list

@router.delete("/user/{admin_id}/{target_id}")
async def delete_user(admin_id: str, target_id: str, db: Session = Depends(get_db)):
    check_admin(admin_id, db)
    
    target_user = db.query(models_db.UserDB).filter(models_db.UserDB.id == target_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        
    db.delete(target_user)
    db.commit()
    return {"status": "success", "message": "Kullanıcı başarıyla silindi."}
