<?php

/**
 * MySQL BLOB storage integration test.
 *
 * Uses a connection-local TEMPORARY TABLE that shadows ReportPhoto. No
 * persistent tables or rows are created or changed.
 *
 * Run only against a loopback MySQL test instance:
 *   RW_RUN_LOCAL_DB_STORAGE_TEST=1 php tests/database_storage_test.php
 */

putenv('NODE_ENV=development');
putenv('STORAGE_DRIVER=database');

require __DIR__ . '/../src/bootstrap.php';

use RoadWatch\Services\Storage;
use RoadWatch\Support\AppError;
use RoadWatch\Support\Config;
use RoadWatch\Support\Db;

$database = parse_url(Config::databaseUrl());
$host = strtolower((string) ($database['host'] ?? ''));
if (getenv('RW_RUN_LOCAL_DB_STORAGE_TEST') !== '1') {
    echo "SKIP: set RW_RUN_LOCAL_DB_STORAGE_TEST=1 to enable temporary-table integration checks.\n";
    exit(0);
}
if (!in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
    fwrite(STDERR, "Refusing to run temporary-table storage tests against a non-loopback database.\n");
    exit(2);
}

$passed = 0;
$failed = 0;

function checkDatabaseStorage(string $name, bool $condition): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  PASS {$name}\n";
    } else {
        $failed++;
        echo "  FAIL {$name}\n";
    }
}

function expectMissingDatabasePhoto(string $key): bool
{
    try {
        Storage::read($key);
    } catch (AppError $error) {
        return $error->status === 404;
    }
    return false;
}

$png = base64_decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgOPAwAAAABJRU5ErkJggg==',
    true
);
if (!is_string($png) || $png === '') {
    fwrite(STDERR, "PNG fixture could not be decoded.\n");
    exit(1);
}

try {
    $pdo = Db::pdo();
    $pdo->exec('CREATE TEMPORARY TABLE `ReportPhoto` (`storageKey` VARCHAR(191) NOT NULL PRIMARY KEY) ENGINE=InnoDB');
    $pdo->exec('ALTER TABLE `ReportPhoto` ADD COLUMN `imageData` MEDIUMBLOB NULL');

    $column = $pdo->query("SHOW COLUMNS FROM `ReportPhoto` LIKE 'imageData'")->fetch();
    checkDatabaseStorage('additive migration creates a nullable MEDIUMBLOB column', $column !== false && $column['Type'] === 'mediumblob');

    $stored = Storage::save($png, 'test.png', 'image/png', 'reports');
    checkDatabaseStorage('database driver returns a safe key and staged bytes', isset($stored['data']) && strlen($stored['data']) === strlen($png));

    Db::transaction(static function () use ($stored): void {
        Db::execute(
            'INSERT INTO `ReportPhoto` (`storageKey`,`imageData`) VALUES (?,?)',
            [$stored['key'], $stored['data']]
        );
    });

    checkDatabaseStorage('database read returns byte-identical image data', Storage::read($stored['key']) === $png);
    checkDatabaseStorage('stored database image is reported present', Storage::exists($stored['key']));

    Storage::remove($stored['key']);
    checkDatabaseStorage('database image removal clears the BLOB', !Storage::exists($stored['key']));
    checkDatabaseStorage('removed database image returns 404', expectMissingDatabasePhoto($stored['key']));

    $large = str_repeat('x', 2 * 1024 * 1024);
    $largeStored = Storage::save($large, 'large.bin', 'application/octet-stream', 'reports');
    Db::execute(
        'INSERT INTO `ReportPhoto` (`storageKey`,`imageData`) VALUES (?,?)',
        [$largeStored['key'], $largeStored['data']]
    );
    checkDatabaseStorage('database round-trips BLOBs larger than 1 MiB', Storage::read($largeStored['key']) === $large);

    $rolledBack = Storage::save($png, 'rollback.png', 'image/png', 'reports');
    try {
        Db::transaction(static function () use ($rolledBack): void {
            Db::execute(
                'INSERT INTO `ReportPhoto` (`storageKey`,`imageData`) VALUES (?,?)',
                [$rolledBack['key'], $rolledBack['data']]
            );
            throw new RuntimeException('intentional rollback');
        });
    } catch (RuntimeException $error) {
        checkDatabaseStorage('database transaction failure is propagated', $error->getMessage() === 'intentional rollback');
    }
    checkDatabaseStorage('rolled-back upload leaves no stored image', !Storage::exists($rolledBack['key']));
} finally {
    if (isset($pdo)) {
        $pdo->exec('DROP TEMPORARY TABLE IF EXISTS `ReportPhoto`');
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
