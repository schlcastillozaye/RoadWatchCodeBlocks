<?php

namespace RoadWatch\Services;

use RoadWatch\Support\AppError;
use RoadWatch\Support\Config;
use RoadWatch\Support\Dates;

/**
 * Local-disk storage driver. Writes uploaded images under the configured
 * storage directory and returns opaque random storage keys. S3 is not
 * implemented in the PHP backend; the local driver covers development,
 * Railway volumes and small deployments.
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
        return 'local';
    }

    /**
     * Production local storage must be the exact path of a mounted persistent
     * volume. An explicit path alone is not enough: verify it in Linux mountinfo.
     */
    public static function assertPersistentStorage(): void
    {
        if (!Config::isProd()) {
            return;
        }

        $configuredMount = Config::storagePersistentMountPath();
        $storagePath = realpath(Config::storageDir());
        $mountPath = $configuredMount !== '' ? realpath($configuredMount) : false;
        if ($storagePath === false || $mountPath === false || $storagePath !== $mountPath) {
            throw new \RuntimeException(
                'Production local storage must match STORAGE_PERSISTENT_MOUNT_PATH.'
            );
        }

        $mountInfo = @file('/proc/self/mountinfo', FILE_IGNORE_NEW_LINES);
        if ($mountInfo === false) {
            throw new \RuntimeException('Cannot verify the production storage volume mount.');
        }

        $isMounted = false;
        foreach ($mountInfo as $line) {
            $fields = explode(' ', explode(' - ', $line, 2)[0]);
            if (!isset($fields[4])) {
                continue;
            }
            $mountedPath = preg_replace_callback(
                '/\\\\([0-7]{3})/',
                static fn (array $match): string => chr(octdec($match[1])),
                $fields[4]
            );
            if ($mountedPath === $mountPath) {
                $isMounted = true;
                break;
            }
        }

        if (!$isMounted || !is_dir($storagePath) || !is_writable($storagePath)) {
            throw new \RuntimeException(
                'Production storage is not a writable persistent mount; refusing local file storage.'
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
     * Persist a buffer, returning its storage metadata.
     *
     * @return array{key:string,sizeBytes:int,mimeType:string,originalName:string}
     */
    public static function save(string $buffer, string $originalName, string $mimeType, string $folder = 'misc'): array
    {
        self::assertPersistentStorage();
        $folder = self::safeSegment($folder);
        $ext = self::extensionForMime($mimeType, $originalName);
        $key = $folder . '/' . base_convert((string) Dates::nowMs(), 10, 36) . '-' . bin2hex(random_bytes(8)) . $ext;
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
