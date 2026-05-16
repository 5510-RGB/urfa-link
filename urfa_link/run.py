import sqlite3
conn = sqlite3.connect('urfa_link.db')
c = conn.cursor()
c.execute('SELECT phone, hashed_password FROM users')
print(c.fetchall())
conn.close()
