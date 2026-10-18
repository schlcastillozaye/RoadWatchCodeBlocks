<?php

namespace RoadWatch\Services;

use RoadWatch\Support\AppError;
use RoadWatch\Support\Config;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;

/**
 * Stores uploaded image bytes in ReportPhoto for durable deployments, with a
 * local-disk driver retained for development and legacy local installations.
 */
class Storage
{
    private const MIME_EXT = [
        'image/jpeg' => '.jpg',
        'image/jpg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/heic' => '.heic',
        'image/heif' => '.heif',
    ];

    public static function name(): string
    {
        return Config::storageDriver();
    }

    /**
     * Production storage must use the application database; the container
     * filesystem is ephemeral and must never be treated as durable storage.
     */
    public static function assertPersistentStorage(): void
    {
        if (Config::isProd() && Config::storageDriver() !== 'database') {
            throw new \RuntimeException(
                'Production photo storage must use STORAGE_DRIVER=database; local container storage is ephemeral.'
            );
        }
    }

    public static function extensionForMime(string $mime, ?string $originalName = null): string
    {
        if (isset(self::MIME_EXT[$mime])) {
            return self::MIME_EXT[$mime];
        }
        $ext = $originalName ? strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) : '';
        if ($ext !== '' && strlen($ext) <= 6) {
            return '.' . $ext;
        }
        return '.bin';
    }

    private static function safeSegment(string $segment): string
    {
        return preg_replace('/[^a-zA-Z0-9._-]/', '_', $segment) ?? 'misc';
    }

    /**
     * Prepare a storage key and metadata; database bytes are committed with the
     * ReportPhoto row so failed report transactions cannot orphan image data.
     *
     * @return array{key:string,sizeBytes:int,mimeType:string,originalName:string,data?:string}
     */
    public static function save(string $buffer, string $originalName, string $mimeType, string $folder = 'misc'): array
    {
        self::assertPersistentStorage();
        $folder = self::safeSegment($folder);
        $ext = self::extensionForMime($mimeType, $originalName);
        $key = $folder . '/' . base_convert((string) Dates::nowMs(), 10, 36) . '-' . bin2hex(random_bytes(8)) . $ext;

        if (Config::storageDriver() === 'database') {
            return [
                'key' => $key,
                'sizeBytes' => strlen($buffer),
                'mimeType' => $mimeType,
                'originalName' => $originalName,
                'data' => $buffer,
            ];
        }

        $full = self::resolve($key);

        $dir = dirname($full);
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw AppError::internal('Could not create the upload directory.');
        }
        $temporary = $full . '.tmp-' . bin2hex(random_bytes(8));
        try {
            $written = @file_put_contents($temporary, $buffer, LOCK_EX);
            if ($written !== strlen($buffer) || !@rename($temporary, $full)) {
                throw AppError::internal('Could not write the uploaded file to storage.');
            }
        } catch (\Throwable $e) {
            if (is_file($temporary)) {
                @unlink($temporary);
            }
            throw $e;
        }

        return [
            'key' => $key,
            'sizeBytes' => strlen($buffer),
            'mimeType' => $mimeType,
            'originalName' => $originalName,
        ];
    }

    public static function read(string $key): string
    {
        self::assertPersistentStorage();
        if (Config::storageDriver() === 'database') {
            $row = Db::one(
                'SELECT `imageData` FROM `ReportPhoto` WHERE `storageKey` = ? LIMIT 1',
                [$key]
            );
            if ($row !== null && is_string($row['imageData'] ?? null) && $row['imageData'] !== '') {
                return $row['imageData'];
            }
        }

        $full = self::resolve($key);
        if (!is_file($full)) {
            throw AppError::notFound('File not found');
        }
        $buffer = @file_get_contents($full);
        if ($buffer === false) {
            throw AppError::notFound('File not found');
        }
        return $buffer;
    }

    public static function remove(string $key): void
    {
        try {
            if (Config::storageDriver() === 'database') {
                Db::execute(
                    'UPDATE `ReportPhoto` SET `imageData` = NULL WHERE `storageKey` = ?',
                    [$key]
                );
            }
            $full = self::resolve($key);
            if (is_file($full)) {
                @unlink($full);
            }
        } catch (\Throwable $e) {
            rw_log('warn', 'Storage remove failed for ' . $key, $e->getMessage());
        }
    }

    public static function exists(string $key): bool
    {
        try {
            if (Config::storageDriver() === 'database') {
                return (int) Db::scalar(
                    'SELECT COUNT(*) FROM `ReportPhoto` WHERE `storageKey` = ? AND `imageData` IS NOT NULL',
                    [$key]
                ) > 0;
            }
            return is_file(self::resolve($key));
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Resolve a storage key to an absolute path, guarding against traversal. */
    private static function resolve(string $key): string
    {
        $key = ltrim(str_replace('\\', '/', $key), '/');
        foreach (explode('/', $key) as $segment) {
            if ($segment === '..') {
                throw AppError::badRequest('Invalid storage key');
            }
        }
        $root = str_replace('\\', '/', rtrim(Config::storageDir(), '/\\'));
        $full = $root . '/' . $key;
        if ($full !== $root && strpos($full, $root . '/') !== 0) {
            throw AppError::badRequest('Invalid storage key');
        }
        return $full;
    }
}
