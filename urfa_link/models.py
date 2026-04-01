from pydantic import BaseModel

class UserNode(BaseModel):
    id: str
    name: str
    phone: str
    district: str
    education: str
    interest_vector: list[float]
    latitude: float
    longitude: float
    profile_image: str | None = None

class RegistrationRequest(BaseModel):
    name: str
    phone: str
    password: str
    email: str | None = None

class LoginRequest(BaseModel):
    phone: str
    password: str

class LoginVerifyRequest(BaseModel):
    phone: str
    otp: str

class PasswordResetRequest(BaseModel):
    phone: str

class PasswordVerifyRequest(BaseModel):
    phone: str
    otp: str
    new_password: str

class MatchResult(BaseModel):
    matched_user_id: str
    matched_user_name: str
    similarity_score: float
    distance_km: float
    profile_image: str | None = None

class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    district: str | None = None
    education: str | None = None
    bio: str | None = None

class SwipeRequest(BaseModel):
    target_id: str
    action: str # "like" or "pass"
