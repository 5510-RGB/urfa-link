from fastapi.testclient import TestClient
from main import app
import json

client = TestClient(app)

def test_chat():
    import random
    rdm = str(random.randint(1000, 9999))
    res1 = client.post("/users/register", json={
        "name": "Alice WS", "tc_kimlik": "1111111" + rdm, "phone": "555111" + rdm,
        "password": "pass", "district": "Merkez", "education": "Lise",
        "bio": "bio", "latitude": 37.1, "longitude": 38.7
    })
    print(res1.json())
    alice_id = res1.json().get("id")

    # 2. Register Bob
    res2 = client.post("/users/register", json={
        "name": "Bob WS", "tc_kimlik": "2222222" + rdm, "phone": "555222" + rdm,
        "password": "pass", "district": "Merkez", "education": "Lise",
        "bio": "bio", "latitude": 37.1, "longitude": 38.7
    })
    print(res2.json())
    bob_id = res2.json().get("id")

    print(f"Alice: {alice_id}, Bob: {bob_id}")

    # 3. Connect Alice WS and send message
    with client.websocket_connect(f"/messages/ws/{alice_id}") as websocket:
        websocket.send_json({
            "receiver_id": bob_id,
            "content": "Hello Bob from Alice!"
        })
        print("Sent msg to Bob")

    # 4. Fetch history
    history_res = client.get(f"/messages/history/{alice_id}/{bob_id}")
    print(f"History Status: {history_res.status_code}")
    print(f"History Data: {history_res.json()}")

test_chat()
