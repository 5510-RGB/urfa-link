import requests
res = requests.post("http://localhost:8000/users/login", json={
    "phone": "05554443322", "password": "pass"
})
print("Login Status:", res.status_code)
print("Login Body:", res.text)
