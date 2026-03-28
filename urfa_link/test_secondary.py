import requests
# Login to get ID
res = requests.post("http://localhost:8000/users/login", json={
    "phone": "05554443322", "password": "pass"
})
user_id = res.json()["user_id"]

stats = requests.get(f"http://localhost:8000/users/{user_id}/stats")
print("Stats Status:", stats.status_code)
print("Stats Body:", stats.text[:100])

mutual = requests.get(f"http://localhost:8000/users/{user_id}/mutual-matches")
print("Mutual Status:", mutual.status_code)
print("Mutual Body:", mutual.text[:100])
