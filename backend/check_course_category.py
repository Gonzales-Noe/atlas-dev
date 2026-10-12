import psycopg2
conn = psycopg2.connect(host='aws-0-ap-northeast-1.pooler.supabase.com', database='postgres', user='postgres.dnkpupegpijryhaffgbc', password='ATLASDEGdev14', port=6543, sslmode='require')
cur = conn.cursor()
cur.execute("SELECT course_code, category FROM course")
for r in cur.fetchall():
    print(f"  {r[0]}: category={r[1]}")