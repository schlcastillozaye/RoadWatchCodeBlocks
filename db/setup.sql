-- ============================================================================
--  RoadWatch — one-time MySQL setup script
-- ============================================================================
--  Target: the MySQL 8.0 server already running on 127.0.0.1:3306
--          (service "MySQL11" -> "C:\Program Files\MySQL\MySQL Server 8.0")
--
--  HOW TO RUN (choose ONE):
--
--    A) MySQL Workbench
--       1. Connect as root.
--       2. File > Open SQL Script > select this file.
--       3. Execute (lightning bolt).
--
--    B) phpMyAdmin (XAMPP)
--       1. Open http://localhost/phpmyadmin  (start Apache in XAMPP if needed)
--       2. Log in as root.
--       3. SQL tab > paste this whole file > Go.
--
--    C) Command line
--       "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < db\setup.sql
--
--  This script is idempotent — running it again is safe.
--  It creates a dedicated database + app user so the app never uses root.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `roadwatch`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Dedicated least-privilege application user.
CREATE USER IF NOT EXISTS 'roadwatch'@'localhost' IDENTIFIED BY 'RoadWatchDev2026';
CREATE USER IF NOT EXISTS 'roadwatch'@'127.0.0.1' IDENTIFIED BY 'RoadWatchDev2026';

GRANT ALL PRIVILEGES ON `roadwatch`.* TO 'roadwatch'@'localhost';
GRANT ALL PRIVILEGES ON `roadwatch`.* TO 'roadwatch'@'127.0.0.1';

FLUSH PRIVILEGES;

-- Verify
SELECT
  SCHEMA_NAME AS `database`,
  DEFAULT_CHARACTER_SET_NAME AS `charset`
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'roadwatch';

SELECT USER AS `created_user`, HOST FROM mysql.user WHERE USER = 'roadwatch';
