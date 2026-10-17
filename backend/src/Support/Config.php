<?php

namespace RoadWatch\Support;

/**
 * Application configuration, resolved from the environment. Mirrors the
 * shape/defaults of the original Node `config/env.ts`.
 */
class Config
{
    public static function nodeEnv(): string
    {
        return Env::str('NODE_ENV', 'development');
    }

    public static function isProd(): bool
    {
        return self::nodeEnv() === 'production';
    }

    public static function port(): int
    {
        return (int) Env::num('PORT', 4000);
    }

    /** @return string[] */
    public static function corsOrigins(): array
    {
        $raw = Env::str('CORS_ORIGINS', 'http://localhost:5173');
        $parts = array_map('trim', explode(',', $raw));
        return array_values(array_filter($parts, static fn ($v) => $v !== ''));
    }

    public static function databaseUrl(): string
    {
        return Env::str('DATABASE_URL', 'mysql://roadwatch:RoadWatchDev2026@127.0.0.1:3306/roadwatch');
    }

    public static function jwtAccessSecret(): string
    {
        return Env::str('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-please-32chars');
    }

    public static function jwtRefreshSecret(): string
    {
        return Env::str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32chars');
    }

    public static function jwtAccessTtl(): string
    {
        return Env::str('JWT_ACCESS_TTL', '15m');
    }

    public static function jwtRefreshTtl(): string
    {
        return Env::str('JWT_REFRESH_TTL', '30d');
    }

    public static function storageDriver(): string
    {
        return Env::str('STORAGE_DRIVER', 'local');
    }

    /** Absolute path to the local storage directory. */
    public static function storageDir(): string
    {
        $dir = Env::str('STORAGE_LOCAL_DIR', 'uploads');
        if ($dir === '') {
            $dir = 'uploads';
        }
        if (preg_match('#^([A-Za-z]:[\\\\/]|/)#', $dir)) {
            return rtrim($dir, '/\\');
        }
        return rtrim(base_path($dir), '/\\');
    }

    public static function publicBaseUrl(): string
    {
        return Env::str('PUBLIC_BASE_URL', '');
    }

    public static function maxUploadBytes(): int
    {
        return (int) Env::num('MAX_UPLOAD_BYTES', 8 * 1024 * 1024);
    }

    public static function imageProcessingEnabled(): bool
    {
        return Env::bool('IMAGE_PROCESSING_ENABLED', false);
    }

    public static function imageProcessingProvider(): string
    {
        return Env::str('IMAGE_PROCESSING_PROVIDER', 'none');
    }

    public static function imageProcessingApiUrl(): string
    {
        return Env::str('IMAGE_PROCESSING_API_URL', '');
    }

    public static function imageProcessingApiKey(): string
    {
        return Env::str('IMAGE_PROCESSING_API_KEY', '');
    }

    public static function googleMapsServerKey(): string
    {
        return Env::str('GOOGLE_MAPS_SERVER_API_KEY', '');
    }
}
