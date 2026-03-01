import sqlite3
conn = sqlite3.connect('urfa_link.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
cursor.execute("SELECT * FROM users WHERE tc_kimlik=?", ('11622030566',))
row = cursor.fetchone()
if row:
    print(dict(row))
else:
    print("User not found.")
conn.close()
