<?php

/**
 * RoadWatch schema migrator (PDO).
 *
 *   php database/migrate.php            # apply backend/database/schema.sql
 *   php database/migrate.php --seed     # apply schema, then run seed.php
 *
 * schema.sql is written with `CREATE TABLE IF NOT EXISTS`, so this command is
 * idempotent and safe to run on every deploy (Railway pre-deploy / release step).
 *
 * It deliberately has NO destructive/reset mode: dropping or wiping tables is
 * never done automatically. Use a disposable database for clean-install tests.
 */

use RoadWatch\Support\Db;

require __DIR__ . '/../src/bootstrap.php';

$withSeed = in_array('--seed', $argv, true) || getenv('SEED_ON_START') === 'true';

$schemaFile = __DIR__ . '/schema.sql';
if (!is_file($schemaFile)) {
    fwrite(STDERR, "schema.sql not found at {$schemaFile}\n");
    exit(1);
}

/**
 * Split a .sql file into individual statements.
 *
 * This schema contains no semicolons inside string literals and no DELIMITER
 * blocks, so stripping `--` line comments and splitting on `;` is sufficient.
 *
 * @return string[]
 */
function rw_split_statements(string $sql): array
{
    $lines = preg_split('/\r\n|\r|\n/', $sql) ?: [];
    $kept = [];
    foreach ($lines as $line) {
        if (str_starts_with(ltrim($line), '--')) {
            continue;
        }
        $kept[] = $line;
    }
    $body = implode("\n", $kept);
    $parts = array_map('trim', explode(';', $body));
    return array_values(array_filter($parts, static fn ($s) => $s !== ''));
}

function rw_column_type(PDO $pdo, string $table, string $column): string
{
    $stmt = $pdo->prepare(
        'SELECT `COLUMN_TYPE` FROM `information_schema`.`COLUMNS`
         WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?'
    );
    $stmt->execute([$table, $column]);
    $type = $stmt->fetchColumn();
    return $type === false ? '' : (string) $type;
}

function rw_column_is_nullable(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT `IS_NULLABLE` FROM `information_schema`.`COLUMNS`
         WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?'
    );
    $stmt->execute([$table, $column]);
    return $stmt->fetchColumn() === 'YES';
}

/**
 * Backward-compatible migrations for databases created by an older schema.
 *
 * `schema.sql` is written entirely with `CREATE TABLE IF NOT EXISTS`, which
 * means it can never *evolve* a table that already exists: a new column or a
 * new enum value only reaches fresh installs. Every additive change therefore
 * needs a patch here. Each patch is guarded by an information_schema check and
 * is safe to run repeatedly, and none of them drop data or remove a value.
 *
 * Rules for future patches:
 *   - ADD COLUMN only when the column is absent.
 *   - To widen an ENUM, restate ALL existing values plus the new one (a MODIFY
 *     with a partial list would silently rewrite rows to '').
 */
function rw_apply_patches(PDO $pdo): void
{
    // 1. Report.categoryOther — the free-text explanation for category OTHER.
    if (rw_column_type($pdo, 'Report', 'categoryOther') === '') {
        $pdo->exec('ALTER TABLE `Report` ADD COLUMN `categoryOther` VARCHAR(300) NULL AFTER `category`');
        echo "  + added Report.categoryOther\n";
    }

    if (rw_column_type($pdo, 'Report', 'destination') === '') {
        $pdo->exec('ALTER TABLE `Report` ADD COLUMN `destination` VARCHAR(300) NULL AFTER `areaLabel`');
        echo "  + added Report.destination\n";
    }
    if (rw_column_type($pdo, 'Report', 'damageCause') === '') {
        $pdo->exec('ALTER TABLE `Report` ADD COLUMN `damageCause` VARCHAR(500) NULL AFTER `destination`');
        echo "  + added Report.damageCause\n";
    }
    if (rw_column_type($pdo, 'Report', 'relatedCategories') === '') {
        $pdo->exec('ALTER TABLE `Report` ADD COLUMN `relatedCategories` TEXT NULL AFTER `damageCause`');
        echo "  + added Report.relatedCategories\n";
    }
    if (rw_column_type($pdo, 'Report', 'surfaceCondition') === '') {
        $pdo->exec('ALTER TABLE `Report` ADD COLUMN `surfaceCondition` VARCHAR(24) NULL AFTER `relatedCategories`');
        echo "  + added Report.surfaceCondition\n";
    }

    if (rw_column_type($pdo, 'ReportPhoto', 'imageData') === '') {
        $pdo->exec('ALTER TABLE `ReportPhoto` ADD COLUMN `imageData` MEDIUMBLOB NULL');
        echo "  + added ReportPhoto.imageData\n";
    }

    $repairStatusType = rw_column_type($pdo, 'Report', 'repairStatus');
    if ($repairStatusType !== ''
        && (!str_contains($repairStatusType, "'AWAITING_VERIFICATION'")
            || !str_contains($repairStatusType, "'VERIFIED_COMPLETED'"))) {
        $pdo->exec(
            "ALTER TABLE `Report` MODIFY `repairStatus`
             ENUM('NOT_ASSIGNED','AWAITING_MAINTENANCE','IN_PROGRESS','AWAITING_VERIFICATION','RETURNED_FOR_WORK','COMPLETED','VERIFIED_COMPLETED')
             NOT NULL DEFAULT 'NOT_ASSIGNED'"
        );
        echo "  + widened Report.repairStatus enum\n";
    }

    if (rw_column_type($pdo, 'Notification', 'assignmentId') !== ''
        && !rw_column_is_nullable($pdo, 'Notification', 'assignmentId')) {
        $pdo->exec('ALTER TABLE `Notification` MODIFY `assignmentId` VARCHAR(191) NULL');
        echo "  + made Notification.assignmentId optional for workflow notifications\n";
    }

    if (rw_column_type($pdo, 'Notification', 'expiresAt') === '') {
        $pdo->exec('ALTER TABLE `Notification` ADD COLUMN `expiresAt` DATETIME(3) NULL AFTER `readAt`');
        $pdo->exec('UPDATE `Notification` SET `expiresAt` = DATE_ADD(`createdAt`, INTERVAL 5 MINUTE) WHERE `expiresAt` IS NULL');
        echo "  + added Notification.expiresAt (existing notices retain bounded visibility)\n";
    }

    // 2. Report.category must accept every value Schema::CATEGORIES validates.
    if (!str_contains(rw_column_type($pdo, 'Report', 'category'), "'ROAD_OBSTRUCTION'")) {
        $pdo->exec(
            "ALTER TABLE `Report` MODIFY `category`
             ENUM('POTHOLE','DAMAGED_PAVEMENT','ROAD_CRACK','FLOODING','DAMAGED_DRAINAGE','ROAD_OBSTRUCTION','OTHER') NOT NULL"
        );
        echo "  + widened Report.category enum\n";
    }

    // 3. Defensive: a report with no category (only possible on a database
    //    predating the NOT NULL column) is normalised to OTHER so it keeps
    //    rendering instead of breaking a NOT NULL write later.
    $normalised = $pdo->exec("UPDATE `Report` SET `category` = 'OTHER' WHERE `category` IS NULL");
    if ($normalised) {
        echo "  + normalised {$normalised} report(s) with no category\n";
    }
}

try {
    $pdo = Db::pdo();
    $dbName = (string) Db::scalar('SELECT DATABASE()');
    echo "Applying schema to database: {$dbName}\n";

    $statements = rw_split_statements((string) file_get_contents($schemaFile));
    $applied = 0;
    foreach ($statements as $statement) {
        $pdo->exec($statement);
        $applied++;
    }
    echo "Applied {$applied} statement(s). Schema is up to date.\n";

    echo "Applying backward-compatible patches...\n";
    rw_apply_patches($pdo);
    echo "Patches applied.\n";

    $tables = Db::all('SHOW TABLES');
    echo 'Tables now present: ' . count($tables) . "\n";

    if ($withSeed) {
        echo "Running seed.php --\n";
        passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../seed.php'), $code);
        if ($code !== 0) {
            fwrite(STDERR, "seed.php exited with code {$code}\n");
            exit($code);
        }
    }

    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, "Migration failed: {$e->getMessage()}\n");
    exit(1);
}
