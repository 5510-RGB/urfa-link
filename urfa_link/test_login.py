import requests
import json

res = requests.post("http://localhost:8000/users/login", json={
    "tc_kimlik": "11622030566",
    "password": "Password123" # Don't know password but maybe it's not needed if we can check logic. Wait, we need it.
})
print(res.status_code)
print(res.text)
