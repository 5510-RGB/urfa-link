from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
import shutil
from pydantic import BaseModel
from passlib.context import CryptContext

from models import RegistrationRequest, LoginRequest, UserNode, MatchResult, PasswordResetRequest, PasswordVerifyRequest, ProfileUpdateRequest, SwipeRequest, LoginVerifyRequest
from database import get_db
from models_db import UserDB, MatchActionDB
from services.security import SecurityProtocol
from services.ai_bio_analyzer import AIBioAnalyzer
from services.graph_engine import graph_db
from services.geo_engine import GeoIndex
from services.email_service import send_otp_email
import random
import string
from datetime import datetime, timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/register", response_model=UserNode, status_code=status.HTTP_201_CREATED)
async def register_user(request: RegistrationRequest, db: Session = Depends(get_db)):
    # Check if user with same phone exists
    existing = db.query(UserDB).filter(UserDB.phone == request.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this phone number already exists.")
        
    # Default values for fields removed from registration form
    default_bio = ""
    default_district = ""
    default_education = ""
    default_lat = 37.5833
    default_lon = 38.9500
    default_interest_vector = []
    
    # Hash the password
    hashed_pwd = pwd_context.hash(request.password)
    
    # Create UserNode
    user_id = str(uuid.uuid4())
    new_user = UserNode(
        id=user_id,
        name=request.name,
        phone=request.phone,
        district=default_district,
        education=default_education,
        interest_vector=default_interest_vector,
        latitude=default_lat,
        longitude=default_lon
    )
    
    # Check if this user should be an admin
    is_admin_user = False
    admin_phones = ["05555555555"]
    if request.phone in admin_phones:
        is_admin_user = True
        
    db_user = UserDB(
        id=new_user.id,
        name=new_user.name,
        phone=new_user.phone,
        district=new_user.district,
        education=new_user.education,
        bio=default_bio,
        hashed_password=hashed_pwd,
        interest_vector=str(new_user.interest_vector),
        latitude=new_user.latitude,
        longitude=new_user.longitude,
        is_admin=is_admin_user,
        email=request.email
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return new_user

@router.post("/login")
async def login_user(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.phone == request.phone).first()
    if not user:
        raise HTTPException(status_code=400, detail="Geçersiz Telefon Numarası veya Şifre")
        
    try:
        if not pwd_context.verify(request.password[:72], user.hashed_password):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz Telefon Numarası veya Şifre")

    # If user has email, send OTP
    if user.email:
        otp = ''.join(random.choices(string.digits, k=6))
        user.login_otp = otp
        user.login_otp_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
        
        send_otp_email(user.email, otp, user.name)
        
        return {
            "otp_required": True,
            "message": f"Doğrulama kodu {user.email} adresine gönderildi."
        }
    
    # No email - direct login (backward compat)
    return {
        "otp_required": False,
        "message": "Giriş Başarılı", 
        "user_id": user.id, 
        "name": user.name,
        "bio": user.bio,
        "district": user.district,
        "education": user.education,
        "profile_image": user.profile_image,
        "is_admin": user.is_admin,
        "daily_status": user.daily_status,
        "story_image": user.story_image if user.story_image and user.story_updated_at and (datetime.utcnow() - user.story_updated_at).total_seconds() < 86400 else None
    }

@router.post("/verify-login-otp")
async def verify_login_otp(request: LoginVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.phone == request.phone).first()
    if not user:
        raise HTTPException(status_code=400, detail="Kullanıcı bulunamadı")
    
    if not user.login_otp or user.login_otp != request.otp:
        raise HTTPException(status_code=400, detail="Geçersiz doğrulama kodu")
    
    if user.login_otp_expires and datetime.utcnow() > user.login_otp_expires:
        raise HTTPException(status_code=400, detail="Doğrulama kodunun süresi doldu")
    
    # Clear OTP after successful use
    user.login_otp = None
    user.login_otp_expires = None
    db.commit()
    
    return {
        "otp_required": False,
        "message": "Giriş Başarılı",
        "user_id": user.id,
        "name": user.name,
        "bio": user.bio,
        "district": user.district,
        "education": user.education,
        "profile_image": user.profile_image,
        "is_admin": user.is_admin,
        "daily_status": user.daily_status,
        "story_image": user.story_image if user.story_image and user.story_updated_at and (datetime.utcnow() - user.story_updated_at).total_seconds() < 86400 else None
    }

class ForgotPasswordRequest(BaseModel):
    phone: str

@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.phone == request.phone).first()
    if not user:
        raise HTTPException(status_code=400, detail="Bu telefon numarasına ait kullanıcı bulunamadı.")
        
    if not user.email:
        raise HTTPException(status_code=400, detail="Hesabınıza kayıtlı e-posta yok. Şifre sıfırlanamıyor.")
        
    otp = ''.join(random.choices(string.digits, k=6))
    user.login_otp = otp
    user.login_otp_expires = datetime.utcnow() + timedelta(minutes=5)
    db.commit()
    
    send_otp_email(user.email, otp, user.name)
    return {"message": "Doğrulama kodu gönderildi."}

class ResetPasswordRequest(BaseModel):
    phone: str
    otp: str
    new_password: str

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.phone == request.phone).first()
    if not user:
        raise HTTPException(status_code=400, detail="Kullanıcı bulunamadı")
    
    if not user.login_otp or user.login_otp != request.otp:
        raise HTTPException(status_code=400, detail="Geçersiz doğrulama kodu")
    
    if user.login_otp_expires and datetime.utcnow() > user.login_otp_expires:
        raise HTTPException(status_code=400, detail="Doğrulama kodunun süresi doldu")
    
    user.login_otp = None
    user.login_otp_expires = None
    user.hashed_password = pwd_context.hash(request.new_password)
    db.commit()
    
    return {"message": "Şifre başarıyla güncellendi."}

class LocationUpdateRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float

@router.post("/update-location")
async def update_location(request: LocationUpdateRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        
    user.latitude = request.latitude
    user.longitude = request.longitude
    db.commit()
    return {"message": "Konum güncellendi"}

@router.post("/{user_id}/upload-profile-image")
async def upload_profile_image(user_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    # Read file and convert to Base64 for persistence
    try:
        import base64
        file_content = await file.read()
        # Optional: Add basic validation/compression here if needed
        base64_data = base64.b64encode(file_content).decode('utf-8')
        mime_type = file.content_type or 'image/jpeg'
        db_file_path = f"data:{mime_type};base64,{base64_data}"
        
        user.profile_image = db_file_path
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Görsel işlenemedi: {str(e)}")

    return {"message": "Profil fotoğrafı başarıyla güncellendi (Kalıcı)", "profile_image": db_file_path}
    
@router.post("/{user_id}/upload-story")
async def upload_story(user_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    try:
        import base64
        file_content = await file.read()
        base64_data = base64.b64encode(file_content).decode('utf-8')
        mime_type = file.content_type or 'image/jpeg'
        db_file_path = f"data:{mime_type};base64,{base64_data}"
        
        user.story_image = db_file_path
        user.story_updated_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hikaye işlenemedi: {str(e)}")

    return {"message": "Hikaye başarıyla paylaşıldı! (Kalıcı)", "story_image": db_file_path}

@router.put("/{user_id}/profile")
async def update_profile(user_id: str, request: ProfileUpdateRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if request.name is not None:
        user.name = request.name
    if request.district is not None:
        user.district = request.district
    if request.education is not None:
        user.education = request.education
        
    if request.bio is not None and request.bio.strip() != user.bio:
        user.bio = request.bio.strip()
        # Re-run Gemini AI if bio changes
        new_interest_vector = AIBioAnalyzer.analyze_bio(user.bio)
        user.interest_vector = str(new_interest_vector)
        
    if request.daily_status is not None:
        user.daily_status = request.daily_status
        user.status_updated_at = datetime.utcnow()
        
    db.commit()
    db.refresh(user)
    
    return {
        "message": "Profil başarıyla güncellendi",
        "user_id": user.id,
        "name": user.name,
        "district": user.district,
        "education": user.education,
        "bio": user.bio,
        "daily_status": user.daily_status
    }

@router.get("/{user_id}/matches", response_model=List[MatchResult])
async def get_matches(user_id: str, db: Session = Depends(get_db)):
    user = graph_db.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    all_users = graph_db.get_all_users(db)

    matches = []
    
    # Get all users the current user has already swiped on
    swiped_users_records = db.query(MatchActionDB.target_id).filter(MatchActionDB.actor_id == user.id).all()
    swiped_user_ids = {record[0] for record in swiped_users_records}

    # Get blocked users (either we blocked them or they blocked us)
    from models_db import BlockDB
    blocked_records = db.query(BlockDB).filter((BlockDB.blocker_id == user_id) | (BlockDB.blocked_id == user_id)).all()
    blocked_user_ids = {b.blocked_id if b.blocker_id == user_id else b.blocker_id for b in blocked_records}

    # Get explicitly followed (liked) users to show them on map even if not matching 75%
    liked_records = db.query(MatchActionDB.target_id).filter(MatchActionDB.actor_id == user.id, MatchActionDB.action == 'like').all()
    liked_user_ids = {r[0] for r in liked_records}

    for other_user in all_users:
        if other_user.id == user.id:
            continue
            
        # Hide users we've blocked (but NOT those we've swiped if they are followed)
        if other_user.id in blocked_user_ids:
            continue
            
        # If not followed, hide users we've already taken an action on (to maintain Discovery tab)
        is_liked = other_user.id in liked_user_ids
        if other_user.id in swiped_user_ids and not is_liked:
            continue
            
        # 1. Filter by 20km radius using AG-GeoIndex
        distance = GeoIndex.calculate_distance(
            user.latitude, user.longitude,
            other_user.latitude, other_user.longitude
        )
        
        if distance <= 20.0:
            # Check if this is a followed user OR a high-similarity match
            is_followed = other_user.id in liked_user_ids
            similarity = graph_db.calculate_similarity(user.interest_vector, other_user.interest_vector)
            
            if is_followed or similarity >= 0.75:
                from datetime import timedelta
                ds = None
                if other_user.daily_status and other_user.status_updated_at:
                    if datetime.utcnow() - other_user.status_updated_at < timedelta(hours=24):
                        ds = other_user.daily_status
                
                si = None
                if other_user.story_image and other_user.story_updated_at:
                    if datetime.utcnow() - other_user.story_updated_at < timedelta(hours=24):
                        si = other_user.story_image

                match = MatchResult(
                    matched_user_id=other_user.id,
                    matched_user_name=other_user.name,
                    similarity_score=similarity,
                    distance_km=distance,
                    profile_image=other_user.profile_image,
                    daily_status=ds,
                    story_image=si
                )
                matches.append(match)
                
    # Sort matches by target priority: nearest distance or highest similarity. 
    # For now, let's sort by highest similarity.
    matches.sort(key=lambda x: x.similarity_score, reverse=True)
    return matches

@router.get("/{user_id}/map-locations", response_model=List[MatchResult])
async def get_map_locations(user_id: str, db: Session = Depends(get_db)):
    user = graph_db.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    all_users = graph_db.get_all_users(db)

    locations = []
    
    # Get blocked users (either we blocked them or they blocked us)
    from models_db import BlockDB
    blocked_records = db.query(BlockDB).filter((BlockDB.blocker_id == user_id) | (BlockDB.blocked_id == user_id)).all()
    blocked_user_ids = {b.blocked_id if b.blocker_id == user_id else b.blocker_id for b in blocked_records}

    for other_user in all_users:
        if other_user.id == user.id:
            continue
            
        # Hide users we've blocked
        if other_user.id in blocked_user_ids:
            continue
            
        # 1. Expand radius to 50km for Snap Map logic
        distance = GeoIndex.calculate_distance(
            user.latitude, user.longitude,
            other_user.latitude, other_user.longitude
        )
        
        if distance <= 50.0:
            # We don't filter out by similarity or swiped history. Everyone shows.
            similarity = graph_db.calculate_similarity(user.interest_vector, other_user.interest_vector)
            
            from datetime import timedelta
            ds = None
            if other_user.daily_status and other_user.status_updated_at:
                if datetime.utcnow() - other_user.status_updated_at < timedelta(hours=24):
                    ds = other_user.daily_status
            
            si = None
            if other_user.story_image and other_user.story_updated_at:
                if datetime.utcnow() - other_user.story_updated_at < timedelta(hours=24):
                    si = other_user.story_image

            location_result = MatchResult(
                matched_user_id=other_user.id,
                matched_user_name=other_user.name,
                similarity_score=similarity,
                distance_km=distance,
                profile_image=other_user.profile_image,
                daily_status=ds,
                story_image=si
            )
            locations.append(location_result)
                
    return locations

@router.post("/{user_id}/swipe")
async def process_swipe(user_id: str, request: SwipeRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    target = db.query(UserDB).filter(UserDB.id == request.target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    # Check if action already exists
    existing_action = db.query(MatchActionDB).filter(
        MatchActionDB.actor_id == user_id, 
        MatchActionDB.target_id == request.target_id
    ).first()
    
    if existing_action:
        existing_action.action = request.action
    else:
        new_action = MatchActionDB(
            actor_id=user_id,
            target_id=request.target_id,
            action=request.action
        )
        db.add(new_action)
        
    db.commit()
    
    # Check for mutual match if action is 'like'
    is_mutual = False
    if request.action == "like":
        mutual_action = db.query(MatchActionDB).filter(
            MatchActionDB.actor_id == request.target_id,
            MatchActionDB.target_id == user_id,
            MatchActionDB.action == "like"
        ).first()
        if mutual_action:
            is_mutual = True
            
    return {"message": "Aksiyon kaydedildi", "is_mutual": is_mutual}

@router.get("/{user_id}/stats")
async def get_user_stats(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Following: users I liked
    following = db.query(MatchActionDB.target_id).filter(
        MatchActionDB.actor_id == user_id,
        MatchActionDB.action == "like"
    ).all()
    following_ids = {record[0] for record in following}
    
    # Followers: users who liked me
    followers = db.query(MatchActionDB.actor_id).filter(
        MatchActionDB.target_id == user_id,
        MatchActionDB.action == "like"
    ).all()
    follower_ids = {record[0] for record in followers}
    
    # Mutual: intersection
    mutual_ids = following_ids.intersection(follower_ids)
    
    return {
        "following_count": len(following_ids),
        "followers_count": len(follower_ids),
        "mutual_count": len(mutual_ids)
    }

@router.get("/{user_id}/mutual-matches")
async def get_mutual_matches(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Find all users that the current user liked
    liked_targets = db.query(MatchActionDB.target_id).filter(
        MatchActionDB.actor_id == user_id,
        MatchActionDB.action == "like"
    ).all()
    liked_target_ids = {record[0] for record in liked_targets}
    
    # Find all users that liked the current user
    liked_by = db.query(MatchActionDB.actor_id).filter(
        MatchActionDB.target_id == user_id,
        MatchActionDB.action == "like"
    ).all()
    liked_by_ids = {record[0] for record in liked_by}
    
    # The intersection is mutual matches
    mutual_ids = liked_target_ids.intersection(liked_by_ids)
    
    mutual_users = []
    if mutual_ids:
        mutual_users_db = db.query(UserDB).filter(UserDB.id.in_(mutual_ids)).all()
        for mu in mutual_users_db:
            mutual_users.append({
                "id": mu.id,
                "name": mu.name,
                "profile_image": mu.profile_image
            })
            
    return mutual_users

@router.get("/{user_id}/connections/{connection_type}")
async def get_connections(user_id: str, connection_type: str, db: Session = Depends(get_db)):
    if connection_type not in ["followers", "following", "mutual"]:
        raise HTTPException(status_code=400, detail="Invalid connection type")
        
    following = db.query(MatchActionDB.target_id).filter(MatchActionDB.actor_id == user_id, MatchActionDB.action == "like").all()
    following_ids = {r[0] for r in following}
    
    followers = db.query(MatchActionDB.actor_id).filter(MatchActionDB.target_id == user_id, MatchActionDB.action == "like").all()
    follower_ids = {r[0] for r in followers}
    
    if connection_type == "following":
        target_ids = following_ids
    elif connection_type == "followers":
        target_ids = follower_ids
    else:
        target_ids = following_ids.intersection(follower_ids)
        
    users = []
    if target_ids:
        users_db = db.query(UserDB).filter(UserDB.id.in_(target_ids)).all()
        for u in users_db:
            users.append({"id": u.id, "name": u.name, "profile_image": u.profile_image})
            
    return users

@router.delete("/{user_id}/unfollow/{target_id}")
async def unfollow_user(user_id: str, target_id: str, db: Session = Depends(get_db)):
    db.query(MatchActionDB).filter(
        MatchActionDB.actor_id == user_id, MatchActionDB.target_id == target_id, MatchActionDB.action == "like"
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Takipten çıkıldı"}

@router.delete("/{user_id}/remove-follower/{target_id}")
async def remove_follower(user_id: str, target_id: str, db: Session = Depends(get_db)):
    db.query(MatchActionDB).filter(
        MatchActionDB.actor_id == target_id, MatchActionDB.target_id == user_id, MatchActionDB.action == "like"
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Takipçi silindi"}

@router.post("/{user_id}/block/{target_id}")
async def block_user(user_id: str, target_id: str, db: Session = Depends(get_db)):
    from models_db import BlockDB, MessageDB
    # Insert block
    block = BlockDB(blocker_id=user_id, blocked_id=target_id)
    db.add(block)
    
    # Delete match actions in both directions
    db.query(MatchActionDB).filter(
        ((MatchActionDB.actor_id == user_id) & (MatchActionDB.target_id == target_id)) | 
        ((MatchActionDB.actor_id == target_id) & (MatchActionDB.target_id == user_id))
    ).delete(synchronize_session=False)
    
    # Delete chat history in both directions
    db.query(MessageDB).filter(
        ((MessageDB.sender_id == user_id) & (MessageDB.receiver_id == target_id)) | 
        ((MessageDB.sender_id == target_id) & (MessageDB.receiver_id == user_id))
    ).delete(synchronize_session=False)
    
    db.commit()
    return {"message": "Kullanıcı başarıyla engellendi."}

@router.get("/{user_id}/icebreaker/{target_id}")
async def get_icebreaker(user_id: str, target_id: str, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    target = db.query(UserDB).filter(UserDB.id == target_id).first()
    
    if not user or not target:
        raise HTTPException(status_code=404, detail="User not found")
        
    import random
    fallbacks = [
        "Selam! Profiline baktım da ortak noktalarımız var gibi, tanışalım mı? 😊",
        "Merhaba! Biyografin çok ilgimi çekti, bugün nasılsın? ✨",
        "Selam! Seninle konuşmak keyifli olabilir diye düşündüm, ne dersin? 👋",
        "Hey! Fotoğrafların ve bio'un harika görünüyor, tanışmak ister misin? 🌸"
    ]
    
    try:
        from services.ai_bio_analyzer import model
        if model:
            # Handle empty bios gracefully
            sender_bio = user.bio if user.bio and len(user.bio.strip()) > 2 else "Belirtilmemiş (Genel bir mesaj öner)"
            target_bio = target.bio if target.bio and len(target.bio.strip()) > 2 else "Belirtilmemiş (Genel bir mesaj öner)"
            
            prompt = (
                f"Sistem: Urfa-Link Arkadaşlık Uygulaması Buzkıran Asistanı.\n"
                f"Görev: Aşağıdaki iki kişinin profillerini incele ve ilk tanışma mesajı öner.\n\n"
                f"Kişi 1 (Gönderen): {sender_bio}\n"
                f"Kişi 2 (Alıcı): {target_bio}\n\n"
                f"Talimat: Karşıdakini etkileyici, sıcak ve doğal bir mesaj yaz. "
                f"Cevabında sadece ÖNERİLEN MESAJI ver. Başka hiçbir açıklama yapma. "
                f"Eğer biyografiler çok kısaysa samimi bir selamlaşma öner."
            )
            response = model.generate_content(prompt)
            # Basic cleaning
            suggested = response.text.replace('`','').strip()
            if len(suggested) < 5: # If AI returns empty or too short
                 return {"suggestion": random.choice(fallbacks)}
            return {"suggestion": suggested}
        else:
            return {"suggestion": random.choice(fallbacks)}
    except Exception as e:
        print(f"!!! ICEBREAKER ERROR: {e}")
        return {"suggestion": random.choice(fallbacks)}

@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    from models_db import MessageDB
    
    # GDPR Right to be Forgotten: Remove all likes, passes, matches, and messages
    db.query(MatchActionDB).filter((MatchActionDB.actor_id == user_id) | (MatchActionDB.target_id == user_id)).delete(synchronize_session=False)
    db.query(MessageDB).filter((MessageDB.sender_id == user_id) | (MessageDB.receiver_id == user_id)).delete(synchronize_session=False)
    
    # Delete the user profile
    db.delete(user)
    db.commit()
    
    # If there's an active graph component, remove them there too
    graph_db.delete_user(db, user_id)
    
    return {"message": "Hesabınız başarıyla kalıcı olarak silindi."}
