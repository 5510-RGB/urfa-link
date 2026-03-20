from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import random
import os
import shutil
from pydantic import BaseModel
from passlib.context import CryptContext

from models import RegistrationRequest, LoginRequest, UserNode, MatchResult, PasswordResetRequest, PasswordVerifyRequest, ProfileUpdateRequest, SwipeRequest
from database import get_db
from models_db import UserDB, MatchActionDB
from services.security import SecurityProtocol
from services.ai_bio_analyzer import AIBioAnalyzer
from services.graph_engine import graph_db
from services.geo_engine import GeoIndex

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/register", response_model=UserNode, status_code=status.HTTP_201_CREATED)
async def register_user(request: RegistrationRequest, db: Session = Depends(get_db)):
    # 1. Validate T.C. Kimlik (AG-Shield element)
    if not SecurityProtocol.validate_tc_identity(request.tc_kimlik, request.name):
        raise HTTPException(status_code=400, detail="Invalid T.C. Kimlik information.")
        
    # Check if user with same TC exists
    existing = db.query(UserDB).filter(UserDB.tc_kimlik == request.tc_kimlik).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this T.C. Kimlik already exists.")
        
    # 2. Analyze bio with Gemini 1.5 Pro to get Interest-Vector
    interest_vector = AIBioAnalyzer.analyze_bio(request.bio)
    
    # 3. Hash the password
    hashed_pwd = pwd_context.hash(request.password)
    
    # 4. Create UserNode
    user_id = str(uuid.uuid4())
    new_user = UserNode(
        id=user_id,
        name=request.name,
        tc_kimlik=request.tc_kimlik,
        phone=request.phone,
        district=request.district,
        education=request.education,
        interest_vector=interest_vector,
        latitude=request.latitude,
        longitude=request.longitude
    )
    
    # We need to save the hashed password to the database as well
    # Since UserNode doesn't have it, we'll pass it alongside or directly create UserDB here
    # But for simplicity let graph_db handle adding UserDB 
    
    # Check if this user should be an admin
    is_admin_user = False
    admin_tcs = ["11111111111", "12345678901"] # Ornek sabit admin T.C.'leri
    if request.tc_kimlik in admin_tcs:
        is_admin_user = True
        
    db_user = UserDB(
        id=new_user.id,
        name=new_user.name,
        tc_kimlik=new_user.tc_kimlik,
        phone=new_user.phone,
        district=new_user.district,
        education=new_user.education,
        bio=request.bio,
        hashed_password=hashed_pwd,
        interest_vector=str(new_user.interest_vector),
        latitude=new_user.latitude,
        longitude=new_user.longitude,
        is_admin=is_admin_user
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return new_user

@router.post("/login")
async def login_user(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.tc_kimlik == request.tc_kimlik).first()
    if not user:
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik No veya Şifre")
        
    if not pwd_context.verify(request.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik No veya Şifre")
        
    return {
        "message": "Giriş Başarılı", 
        "user_id": user.id, 
        "name": user.name,
        "bio": user.bio,
        "district": user.district,
        "education": user.education,
        "profile_image": user.profile_image,
        "is_admin": user.is_admin
    }

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

    # Ensure uploads directory exists
    upload_dir = os.path.join("static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate a unique filename using UUID to prevent overwrites
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    unique_filename = f"{user_id}_{uuid.uuid4().hex[:8]}.{file_extension}"
    file_path = os.path.join(upload_dir, unique_filename)

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {str(e)}")

    # Update DB
    db_file_path = f"/static/uploads/{unique_filename}"
    user.profile_image = db_file_path
    db.commit()

    return {"message": "Profil fotoğrafı güncellendi", "profile_image": db_file_path}

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
        
    db.commit()
    db.refresh(user)
    
    return {
        "message": "Profil başarıyla güncellendi",
        "user_id": user.id,
        "name": user.name,
        "district": user.district,
        "education": user.education,
        "bio": user.bio
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

    for other_user in all_users:
        if other_user.id == user.id:
            continue
            
        # Hide users we've already taken an action on
        if other_user.id in swiped_user_ids:
            continue
            
        # 1. Filter by 20km radius using AG-GeoIndex
        distance = GeoIndex.calculate_distance(
            user.latitude, user.longitude,
            other_user.latitude, other_user.longitude
        )
        
        if distance <= 20.0:
            # 2. Filter by 75% similarity in Interest-Vector (Hobby-Match)
            similarity = graph_db.calculate_similarity(user.interest_vector, other_user.interest_vector)
            if similarity >= 0.75:
                match = MatchResult(
                    matched_user_id=other_user.id,
                    matched_user_name=other_user.name,
                    similarity_score=similarity,
                    distance_km=distance,
                    profile_image=other_user.profile_image
                )
                matches.append(match)
                
    # Sort matches by target priority: nearest distance or highest similarity. 
    # For now, let's sort by highest similarity.
    matches.sort(key=lambda x: x.similarity_score, reverse=True)
    return matches

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
