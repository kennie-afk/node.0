-- 1. Change ownership of all tables
ALTER TABLE announcements OWNER TO church_admin;
ALTER TABLE users OWNER TO church_admin;
ALTER TABLE families OWNER TO church_admin;
ALTER TABLE members OWNER TO church_admin;
ALTER TABLE events OWNER TO church_admin;
ALTER TABLE sermons OWNER TO church_admin;
ALTER TABLE contribution OWNER TO church_admin;
ALTER TABLE attendance OWNER TO church_admin;
ALTER TABLE ministries OWNER TO church_admin;
ALTER TABLE small_groups OWNER TO church_admin;
ALTER TABLE ministry_members OWNER TO church_admin;
ALTER TABLE small_group_members OWNER TO church_admin;

-- 2. Change ownership of sequences (with safety)
DO $$
BEGIN
    ALTER SEQUENCE IF EXISTS announcements_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS users_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS families_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS members_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS events_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS sermons_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS contribution_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS attendance_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS ministries_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS small_groups_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS ministry_members_ministry_id_seq OWNER TO church_admin;
    ALTER SEQUENCE IF EXISTS small_group_members_small_group_id_seq OWNER TO church_admin;
END $$;