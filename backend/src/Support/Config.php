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
        return Env::str('STORAGE_DRIVER', self::isProd() ? 'database' : 'local');
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

    /**
     * Public origin used to build absolute photo URLs.
     *
     * `PUBLIC_BASE_URL` wins when it is set to a real, externally reachable
     * origin. When it is unset — or has been left at a loopback value such as
     * `http://localhost:4000` (the development default that is easy to copy
     * into a host's variables) — the origin of the current request is used
     * instead. Without that fallback every photo URL handed to the mobile app
     * and the web platform would point at the *visitor's own machine*, so
     * images would silently fail to load on a real deployment.
     *
     * It is only consulted in that misconfigured case, so a correct deployment
     * never lets a request header influence the URLs it serves. Under a
     * reverse proxy (Railway, nginx) the forwarded headers are honoured.
     */
    public static function publicBaseUrl(): string
    {
        $configured = rtrim(Env::str('PUBLIC_BASE_URL', ''), '/');
        if ($configured !== '' && !self::isLoopbackOrigin($configured)) {
            return $configured;
        }

        $derived = self::requestOrigin();
        return $derived !== '' ? $derived : $configured;
    }

    /** True when a URL's host is localhost / 127.0.0.1 / ::1 (or a bare path). */
    private static function isLoopbackOrigin(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            return false;
        }
        $host = strtolower(trim($host, '[]'));
        return $host === 'localhost' || $host === '127.0.0.1' || $host === '::1';
    }

    /** Origin of the current HTTP request, or '' outside one (CLI, cron). */
    private static function requestOrigin(): string
    {
        $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '';
        if (!is_string($host) || $host === '') {
            return '';
        }
        $host = trim(explode(',', $host)[0]);
        // A host with a port (example.com:8443) or a bracketed IPv6 literal.
        if ($host === '' || preg_match('#[^A-Za-z0-9.\-:\[\]]#', $host) === 1) {
            return '';
        }

        $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? $_SERVER['REQUEST_SCHEME'] ?? '';
        $proto = strtolower(trim(explode(',', (string) $proto)[0]));
        if ($proto !== 'http' && $proto !== 'https') {
            $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
            $proto = ($https !== '' && $https !== 'off') ? 'https' : 'http';
        }

        return $proto . '://' . $host;
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
