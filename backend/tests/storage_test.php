<?php

/**
 * Focused file-storage and upload-validation regression tests.
 *
 * Run: php tests/storage_test.php
 */

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'roadwatch-storage-test-' . bin2hex(random_bytes(8));
if (!mkdir($root, 0700, true)) {
    fwrite(STDERR, "Could not create temporary test directory.\n");
    exit(1);
}

putenv('NODE_ENV=development');
putenv('STORAGE_LOCAL_DIR=' . $root);
putenv('MAX_UPLOAD_BYTES=128');

require __DIR__ . '/../src/bootstrap.php';

use RoadWatch\Modules\ReportService;
use RoadWatch\Services\Storage;
use RoadWatch\Support\AppError;

$passed = 0;
$failed = 0;
$png = base64_decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgOPAwAAAABJRU5ErkJggg==',
    true
);

function check(string $name, bool $condition): void
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

function expectAppError(callable $callback, int $status): bool
{
    try {
        $callback();
    } catch (AppError $error) {
        return $error->status === $status;
    }
    return false;
}

function storedFiles(string $directory): array
{
    $files = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $files[] = $file->getPathname();
        }
    }
    return $files;
}

$tmpFiles = [];
try {
    check('PNG fixture decodes', is_string($png) && $png !== '');

    if (!is_string($png) || $png === '') {
        throw new RuntimeException('PNG fixture could not be decoded.');
    }

    $saved = Storage::save($png, '../unsafe-name.png', 'image/png', '../reports');
    check('storage key uses a safe folder and generated filename', (bool) preg_match(
        '#^\.\._reports/[a-z0-9]+-[a-f0-9]{16}\.png$#',
        $saved['key']
    ));
    check('storage read returns byte-identical image data', Storage::read($saved['key']) === $png);
    check('saved image exists before cleanup', Storage::exists($saved['key']));

    Storage::remove($saved['key']);
    check('removed image is no longer present', !Storage::exists($saved['key']));
    check('missing image returns 404', expectAppError(
        static fn () => Storage::read($saved['key']),
        404
    ));
    check('path traversal is rejected', expectAppError(
        static fn () => Storage::read('../outside.png'),
        400
    ));

    $badImage = tempnam($root, 'invalid-');
    $partialImage = tempnam($root, 'partial-');
    $largeImage = tempnam($root, 'oversized-');
    $tmpFiles = array_filter([$badImage, $partialImage, $largeImage]);
    file_put_contents($badImage, 'not an image');
    file_put_contents($partialImage, $png);
    file_put_contents($largeImage, $png);

    check('spoofed image MIME is rejected', expectAppError(
        static fn () => ReportService::storeBuffers([[
            'name' => 'spoof.png',
            'type' => 'image/png',
            'tmp_name' => $badImage,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($badImage),
        ]], 'reports'),
        415
    ));

    check('oversized upload is rejected with 413', expectAppError(
        static function () use ($largeImage): void {
            ReportService::storeBuffers([[
                'name' => 'oversized.png',
                'type' => 'image/png',
                'tmp_name' => $largeImage,
                'error' => UPLOAD_ERR_OK,
                'size' => 129,
            ]], 'reports');
        },
        413
    ));

    check('a later failed file removes earlier files from the same batch', expectAppError(
        static fn () => ReportService::storeBuffers([
            [
                'name' => 'valid.png',
                'type' => 'image/png',
                'tmp_name' => $partialImage,
                'error' => UPLOAD_ERR_OK,
                'size' => filesize($partialImage),
            ],
            [
                'name' => 'failed.png',
                'type' => 'image/png',
                'tmp_name' => '',
                'error' => UPLOAD_ERR_PARTIAL,
                'size' => 0,
            ],
        ], 'reports'),
        400
    ));
    check('failed upload batches leave no stored files behind', array_diff(storedFiles($root), $tmpFiles) === []);

    file_put_contents($root . DIRECTORY_SEPARATOR . 'blocked_subdir', 'not a directory');
    check('failed storage write returns an explicit 500 error', expectAppError(
        static fn () => Storage::save($png, 'test.png', 'image/png', 'blocked/subdir'),
        500
    ));
} finally {
    foreach ($tmpFiles as $tmpFile) {
        if (is_file($tmpFile)) {
            unlink($tmpFile);
        }
    }
    foreach (storedFiles($root) as $file) {
        unlink($file);
    }
    if (is_file($root . DIRECTORY_SEPARATOR . 'blocked_subdir')) {
        unlink($root . DIRECTORY_SEPARATOR . 'blocked_subdir');
    }
    foreach (['.._reports', 'reports'] as $folder) {
        $storageFolder = $root . DIRECTORY_SEPARATOR . $folder;
        if (is_dir($storageFolder)) {
            rmdir($storageFolder);
        }
    }
    rmdir($root);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
