import requests
from requests.adapters import HTTPAdapter

base_url = "https://urfa-link-h6c7.onrender.com"

def test_remote_history():
    # 1. Login or register a test user
    import random
    rdm = str(random.randint(1000, 9999))
    res1 = requests.post(f"{base_url}/users/register", json={
        "name": "Remote Test 1", "tc_kimlik": "7777777" + rdm, "phone": "555777" + rdm,
        "password": "pass", "district": "Merkez", "education": "Lise",
        "bio": "bio", "latitude": 37.1, "longitude": 38.7
    })
    print("Res1:", res1.json())
    id_1 = res1.json().get("id")

    res2 = requests.post(f"{base_url}/users/register", json={
        "name": "Remote Test 2", "tc_kimlik": "8888888" + rdm, "phone": "555888" + rdm,
        "password": "pass", "district": "Merkez", "education": "Lise",
        "bio": "bio", "latitude": 37.1, "longitude": 38.7
    })
    print("Res2:", res2.json())
    id_2 = res2.json().get("id")

    import asyncio
    import websockets
    import json

    async def run_ws():
        uri = f"wss://urfa-link-h6c7.onrender.com/messages/ws/{id_1}"
        async with websockets.connect(uri) as websocket:
            await websocket.send(json.dumps({
                "receiver_id": id_2,
                "content": f"Hello from wss test {rdm}"
            }))
            await asyncio.sleep(2)
            hist = requests.get(f"{base_url}/messages/history/{id_1}/{id_2}")
            print("History:", hist.status_code, hist.json())

    if id_1 and id_2:
        asyncio.run(run_ws())
    test_remote_history()
