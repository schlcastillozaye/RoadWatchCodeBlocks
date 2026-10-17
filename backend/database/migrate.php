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
