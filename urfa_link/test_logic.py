from fastapi.testclient import TestClient
from main import app
import os

client = TestClient(app)

def run_tests():
    print("Testing Registration...")
    res1 = client.post("/users/register", json={
        "name": "Ahmet Yilmaz",
        "tc_kimlik": "12345678901",
        "phone": "05554443322",
        "password": "testpassword123",
        "district": "Hilvan",
        "education": "Firat University",
        "bio": "I love playing football and coding Python.",
        "latitude": 37.5833,
        "longitude": 38.9500
    })
    
    res2 = client.post("/users/register", json={
        "name": "Mehmet Demir",
        "tc_kimlik": "10987654321",
        "phone": "05554443323",
        "password": "testpassword123",
        "district": "Center",
        "education": "High School",
        "bio": "Software developer, Python enthusiast and sports fan.",
        "latitude": 37.5900,
        "longitude": 38.9600
    })
    
    if res1.status_code == 201:
        user1 = res1.json()
        print(f"Registered User 1: {user1['name']}")
    elif res1.status_code == 400:
        print("User 1 exist, passing registration.")
        # Need to fetch if we want id, but let's test new identity
        pass
        
    if res2.status_code == 201:
        user2 = res2.json()
        print(f"Registered User 2: {user2['name']}")
        
    # We will just fetch the latest user from DB for test if registration hit 400
    # Or for simplicity, use new random TC numbers for test
    pass

import uuid

def run_db_tests():
    print("Testing Registration with Persistent DB...")
    
    # Generate unique TC Numbers so we don't get 400 Already Exists 
    # across multiple runs of the test
    tc1 = str(uuid.uuid4().int)[:11]
    tc2 = str(uuid.uuid4().int)[:11]
    
    phone1 = "0" + str(uuid.uuid4().int)[:10]
    phone2 = "0" + str(uuid.uuid4().int)[:10]
    
    res1 = client.post("/users/register", json={
        "name": "Ahmet Yilmaz Test",
        "tc_kimlik": tc1,
        "phone": phone1,
        "password": "testpassword123",
        "district": "Hilvan",
        "education": "Firat University",
        "bio": "I love playing football and coding Python.",
        "latitude": 37.5833,
        "longitude": 38.9500
    })
    
    res2 = client.post("/users/register", json={
        "name": "Mehmet Demir Test",
        "tc_kimlik": tc2,
        "phone": phone2,
        "password": "testpassword123",
        "district": "Center",
        "education": "High School",
        "bio": "Software developer, Python enthusiast and sports fan.",
        "latitude": 37.5900,
        "longitude": 38.9600
    })
    
    if res1.status_code == 201:
        user1 = res1.json()
        print(f"Registered DB User 1: {user1['name']} with TC: {tc1}")
        
        print(f"\nTesting Matches for DB User 1 (ID: {user1['id']})...")
        matches_res = client.get(f"/users/{user1['id']}/matches")
        if matches_res.status_code == 200:
            matches = matches_res.json()
            if not matches:
                print("No matches found (maybe similarity < 75% or distance > 20km)")
            for match in matches:
                print(f"Match: {match['matched_user_name']} - Similarity: {match['similarity_score']:.2f} - Distance: {match['distance_km']:.2f} km")
        else:
            print("Matches failed:", matches_res.text)
    else:
        print("Registration failed:", res1.text)

if __name__ == "__main__":
    run_db_tests()
