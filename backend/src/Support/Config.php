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
        $raw = Env::str('CORS_ORIGINS', 'http://localhost:8080,http://localhost:3000,http://localhost:5173');
        $parts = array_map('trim', explode(',', $raw));
        return array_values(array_filter($parts, static fn ($v) => $v !== ''));
    }

    public static function databaseUrl(): string
    {
        return Env::str('DATABASE_URL', 'mysql://roadwatch:CHANGE_ME_DB_PASSWORD@127.0.0.1:3306/roadwatch');
    }

    public static function jwtAccessSecret(): string
    {
        return self::guardSecret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-please-32chars');
    }

    public static function jwtRefreshSecret(): string
    {
        return self::guardSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32chars');
    }

    /**
     * Refuse to start in production with a placeholder / development JWT secret.
     * Tokens signed with a publicly known key can be forged by anyone, so a
     * missing secret must fail loudly at boot rather than run insecurely.
     */
    private static function guardSecret(string $key, string $devDefault): string
    {
        $value = Env::str($key, $devDefault);
        if (self::isProd() && ($value === $devDefault || str_starts_with($value, 'change-me') || strlen($value) < 32)) {
            throw new \RuntimeException(
                "Refusing to start: {$key} must be a strong, unique value of at least 32 characters in production."
            );
        }
        return $value;
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
