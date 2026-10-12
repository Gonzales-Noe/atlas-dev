-- Applies integrations migrations 0026_section_institution_courses_blocks and
-- 0027_courseload_section_fk to the shared Supabase database by hand, for when
-- `manage.py migrate` cannot reach it. Equivalent to running both migrations on
-- the schema that existed on 2026-09-30 (old atlas-web-noe 0022-0024 plus
-- jasmin-web 0022-0025 applied). Runs as one transaction: any error rolls back
-- everything.

BEGIN;

SET CONSTRAINTS ALL IMMEDIATE;

-- ── Preconditions ─────────────────────────────────────────────────────────────
DO $pre$
BEGIN
    IF EXISTS (SELECT 1 FROM django_migrations
               WHERE app = 'integrations'
                 AND name IN ('0026_section_institution_courses_blocks', '0027_courseload_section_fk')) THEN
        RAISE EXCEPTION '0026/0027 are already recorded as applied; nothing to do.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM django_migrations
                   WHERE app = 'integrations' AND name = '0025_add_college_to_userprofile') THEN
        RAISE EXCEPTION '0025_add_college_to_userprofile is not applied yet.';
    END IF;
    IF to_regclass('public.sections') IS NULL
       OR to_regclass('public.blocks') IS NULL
       OR to_regclass('public.section_courses') IS NULL THEN
        RAISE EXCEPTION 'Expected tables sections, blocks and section_courses to exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'course_load' AND column_name = 'section')
       OR EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'course_load' AND column_name = 'section_id') THEN
        RAISE EXCEPTION 'Expected course_load.section (text) and no course_load.section_id.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'academic_section' AND column_name = 'institution_id') THEN
        RAISE EXCEPTION 'academic_section.institution_id already exists.';
    END IF;
END
$pre$;

-- ══ 0026_section_institution_courses_blocks ═══════════════════════════════════

-- Section.program / Section.year_level become optional.
ALTER TABLE academic_section ALTER COLUMN program_id DROP NOT NULL;
ALTER TABLE academic_section ALTER COLUMN year_level_id DROP NOT NULL;

-- Section.institution
ALTER TABLE academic_section ADD COLUMN institution_id uuid NULL;
ALTER TABLE academic_section
    ADD CONSTRAINT academic_section_institution_id_fk_institution
    FOREIGN KEY (institution_id) REFERENCES institution (institution_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX academic_section_institution_id_idx ON academic_section (institution_id);

-- Move every foreign key that points at the old `sections` table (blocks.section_id,
-- section_courses.section_id) to academic_section, copy the old sections over with
-- the same ids, then drop `sections`.
DO $retarget$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conname, c.conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'sections'::regclass
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
        EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES academic_section (section_id) '
            'DEFERRABLE INITIALLY DEFERRED NOT VALID',
            r.tbl, r.tbl || '_' || r.col || '_academic_section_fk', r.col
        );
    END LOOP;
END
$retarget$;

INSERT INTO academic_section (section_id, institution_id, code, name, created_at)
SELECT s.section_id, s.institution_id, LEFT(s.section_name, 50), '', s.created_at
FROM sections s
WHERE NOT EXISTS (SELECT 1 FROM academic_section a WHERE a.section_id = s.section_id);

DO $validate$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conname, c.conrelid::regclass::text AS tbl
        FROM pg_constraint c
        WHERE c.contype = 'f' AND NOT c.convalidated
          AND c.confrelid = 'academic_section'::regclass
    LOOP
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END
$validate$;

DROP TABLE sections;

-- Stale records: old atlas-web-noe migrations (replaced by 0026/0027) and an
-- unreleased jasmin-web draft. Their files no longer exist.
DELETE FROM django_migrations
WHERE app = 'integrations'
  AND name IN ('0022_blocks', '0023_sections', '0024_courseload_section_fk', '0022_courseload_unique_together');

-- Sections created in the academic structure get their program's institution.
UPDATE academic_section a
SET institution_id = p.institution_id
FROM program p
WHERE a.institution_id IS NULL AND a.program_id = p.program_id;

-- Seed roster rows for scanned student IDs not yet in blocks.
INSERT INTO blocks (block_id, grade_level, student_id, section_id, created_at, updated_at)
SELECT gen_random_uuid(), '', sid, NULL, now(), now()
FROM (
    SELECT DISTINCT btrim(student_identifier) AS sid
    FROM bubble_sheet_scans
    WHERE student_identifier IS NOT NULL
) scanned
WHERE sid ~ '^\d{2}-\d{4,6}$'
ON CONFLICT (student_id) DO NOTHING;

-- ══ 0027_courseload_section_fk ════════════════════════════════════════════════

-- Drop every unique constraint on course_load that involves the section column.
DO $drop_uniques$
DECLARE
    con text;
BEGIN
    FOR con IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'course_load'::regclass AND c.contype = 'u'
          AND a.attname IN ('section', 'section_id')
    LOOP
        EXECUTE format('ALTER TABLE course_load DROP CONSTRAINT %I', con);
    END LOOP;
END
$drop_uniques$;

ALTER TABLE course_load RENAME COLUMN section TO section_legacy;

ALTER TABLE course_load ADD COLUMN section_id uuid NULL;
ALTER TABLE course_load
    ADD CONSTRAINT course_load_section_id_fk_academic_section
    FOREIGN KEY (section_id) REFERENCES academic_section (section_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX course_load_section_id_idx ON course_load (section_id);

-- Link each course load to a Section. Text names are matched by code or by the
-- "PROGRAM CODE" display label within the faculty's institution (created if
-- missing). Loads whose text was wiped are recovered only when exactly one
-- section of the faculty's institution takes the course.
DO $link$
DECLARE
    r record;
    sec uuid;
    n int;
BEGIN
    FOR r IN
        SELECT cl.assignment_id, cl.course_id, cl.faculty_id,
               LEFT(btrim(cl.section_legacy), 50) AS name, u.institution_id AS inst
        FROM course_load cl
        JOIN users u ON u.user_id = cl.faculty_id
    LOOP
        sec := NULL;
        IF r.name <> '' THEN
            SELECT s.section_id INTO sec
            FROM academic_section s
            LEFT JOIN program p ON p.program_id = s.program_id
            WHERE (s.institution_id IS NOT DISTINCT FROM r.inst OR p.institution_id IS NOT DISTINCT FROM r.inst)
              AND (UPPER(s.code) = UPPER(r.name)
                   OR UPPER(COALESCE(p.code, '') || ' ' || s.code) = UPPER(r.name))
            ORDER BY s.code
            LIMIT 1;
            IF sec IS NULL THEN
                sec := gen_random_uuid();
                INSERT INTO academic_section (section_id, institution_id, code, name, created_at)
                VALUES (sec, r.inst, r.name, '', now());
            END IF;
        ELSE
            SELECT count(*), min(x.section_id::text)::uuid INTO n, sec
            FROM (
                SELECT DISTINCT s.section_id
                FROM academic_section s
                JOIN section_courses sc ON sc.section_id = s.section_id
                LEFT JOIN program p ON p.program_id = s.program_id
                WHERE sc.course_id = r.course_id
                  AND (s.institution_id IS NOT DISTINCT FROM r.inst OR p.institution_id IS NOT DISTINCT FROM r.inst)
            ) x;
            IF n <> 1 THEN
                CONTINUE;
            END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM course_load
                   WHERE course_id = r.course_id AND faculty_id = r.faculty_id
                     AND section_id = sec AND assignment_id <> r.assignment_id) THEN
            CONTINUE;
        END IF;

        INSERT INTO section_courses (section_id, course_id) VALUES (sec, r.course_id)
        ON CONFLICT DO NOTHING;
        UPDATE course_load SET section_id = sec WHERE assignment_id = r.assignment_id;
    END LOOP;
END
$link$;

ALTER TABLE course_load DROP COLUMN section_legacy;

ALTER TABLE course_load
    ADD CONSTRAINT course_load_course_id_faculty_id_section_id_uniq
    UNIQUE (course_id, faculty_id, section_id);

-- ── Record both migrations as applied ─────────────────────────────────────────
INSERT INTO django_migrations (app, name, applied) VALUES
    ('integrations', '0026_section_institution_courses_blocks', now()),
    ('integrations', '0027_courseload_section_fk', now());

COMMIT;

-- ── Verify (run after COMMIT) ─────────────────────────────────────────────────
-- SELECT name FROM django_migrations WHERE app = 'integrations' AND name >= '0022' ORDER BY name;
-- SELECT count(*) AS loads, count(section_id) AS linked FROM course_load;
