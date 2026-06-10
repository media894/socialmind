import psycopg2
conn = psycopg2.connect(dbname='socialmind', user='postgres', host='localhost')
cur = conn.cursor()
cur.execute("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name='users'")
print('users table found in:', cur.fetchall())
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
print('All public tables:', [r[0] for r in cur.fetchall()])
conn.close()
