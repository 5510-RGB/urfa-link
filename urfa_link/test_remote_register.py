import requests

try:
    res = requests.post("https://urfa-link-h6c7.onrender.com/users/register", json={
        "name": "Test User",
        "tc_kimlik": "12345678901",
        "phone": "5551234567",
        "password": "Password123",
        "district": "Merkez",
        "education": "Lise",
        "bio": "Merhaba ben test kullanıcısıyım.",
        "latitude": 37.1,
        "longitude": 38.7
    })
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.text}")
except Exception as e:
    print(f"Request failed: {e}")
