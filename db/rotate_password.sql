-- ============================================================================
--  RoadWatch — rotate the application database password
-- ============================================================================
--  Run this as a MySQL administrator (root).
--
--  WHY: the original development password was committed to Git history, so it
--  must be treated as exposed and rotated even though the accounts are
--  localhost-only. Without root/administrator rights the application account
--  cannot rotate itself (it only holds USAGE + ALL ON roadwatch.*).
--
--  HOW TO RUN (either):
--    A) & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < db\rotate_password.sql
--    B) paste into MySQL Workbench / phpMyAdmin while connected as root
--
--  STEPS:
--    1. Replace CHANGE_ME_NEW_PASSWORD below (both lines) with a new strong,
--       unique password. Generate one with:
--         powershell -c "Add-Type -AssemblyName System.Web; [System.Web.Security.Membership]::GeneratePassword(40,8)"
--    2. Run this script as root.
--    3. Put the same password in backend/.env  ->  DATABASE_URL (URL-encode it).
--    4. Restart the API and confirm GET /health still reports database: "up".
--    5. Never commit the new password.
--
--  NOTE: this rotates the LOCAL development database only. The production
--  database is created fresh on the host (e.g. the Railway MySQL plugin) and
--  must use its OWN strong password — never reuse this one.
-- ============================================================================

-- Rotate both host entries so neither account keeps the exposed value.
ALTER USER 'roadwatch'@'localhost' IDENTIFIED BY 'CHANGE_ME_NEW_PASSWORD';
ALTER USER 'roadwatch'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME_NEW_PASSWORD';

FLUSH PRIVILEGES;

-- Verify the accounts still exist (their password hash is not shown).
SELECT USER AS `user`, HOST AS `host`, 'rotated' AS `action`
FROM mysql.user
WHERE USER = 'roadwatch';
