import psycopg2
conn = psycopg2.connect(host='aws-0-ap-northeast-1.pooler.supabase.com', database='postgres', user='postgres.dnkpupegpijryhaffgbc', password='ATLASDEGdev14', port=6543, sslmode='require')
cur = conn.cursor()
cur.execute("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name='course' AND table_schema='public' ORDER BY ordinal_position")
for r in cur.fetchall():
    print(f"  {r[0]}: default={r[1]}, nullable={r[2]}")