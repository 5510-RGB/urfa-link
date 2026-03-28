import requests
res = requests.post("http://localhost:8000/users/register", json={
    "name": "tester", "phone": "05554443322", "password": "pass"
})
print("Register Status:", res.status_code)
print("Register Body:", res.text)
if res.status_code == 201:
    res2 = requests.get(f"http://localhost:8000/users/{res.json()['id']}/matches")
    print("Matches Status:", res2.status_code)
    print("Matches Body:", res2.text)
