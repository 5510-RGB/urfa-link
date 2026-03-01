import numpy as np
from typing import Dict, List, Tuple
from models import UserNode
from models_db import UserDB
from sqlalchemy.orm import Session

class GraphEngine:
    def add_user(self, session: Session, user: UserNode):
        db_user = UserDB(
            id=user.id,
            name=user.name,
            tc_kimlik=user.tc_kimlik,
            district=user.district,
            education=user.education,
            interest_vector=user.interest_vector,
            latitude=user.latitude,
            longitude=user.longitude
        )
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
        return db_user

    def get_user(self, session: Session, user_id: str) -> UserDB:
        return session.query(UserDB).filter(UserDB.id == user_id).first()
        
    def get_all_users(self, session: Session) -> List[UserDB]:
        return session.query(UserDB).all()

    def calculate_similarity(self, vec1, vec2) -> float:
        import json
        if isinstance(vec1, str):
            try:
                vec1 = json.loads(vec1)
            except:
                vec1 = [0.0] * 5
        if isinstance(vec2, str):
            try:
                vec2 = json.loads(vec2)
            except:
                vec2 = [0.0] * 5
                
        v1 = np.array(vec1, dtype=float)
        v2 = np.array(vec2, dtype=float)
        if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
            return 0.0
        return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))

graph_db = GraphEngine()
