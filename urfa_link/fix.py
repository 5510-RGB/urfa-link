import sqlite3
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
hash1 = pwd_context.hash('pass')
conn = sqlite3.connect('urfa_link.db')
c = conn.cursor()
c.execute('UPDATE users SET hashed_password = ?', (hash1,))
conn.commit()
conn.close()
print('FIX DONE')
