<?php

namespace RoadWatch\Support;

/** CORS handling matching the original Express configuration. */
class Cors
{
    public static function apply(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = Config::corsOrigins();
        $allowAll = in_array('*', $allowed, true);
        $isAllowed = in_array($origin, $allowed, true) || self::isAllowedLoopbackAlias($origin, $allowed);

        if ($origin === '' || $allowAll || $isAllowed) {
            if ($origin !== '') {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
            }
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Requested-With');
        header('Access-Control-Max-Age: 86400');
    }

    /** Allow localhost and 127.0.0.1 to share explicitly allow-listed local dev ports. */
    private static function isAllowedLoopbackAlias(string $origin, array $allowed): bool
    {
        $requested = parse_url($origin);
        if (
            $requested === false
            || ($requested['scheme'] ?? '') !== 'http'
            || !in_array($requested['host'] ?? '', ['localhost', '127.0.0.1'], true)
        ) {
            return false;
        }

        $requestedPort = $requested['port'] ?? 80;
        foreach ($allowed as $allowedOrigin) {
            $configured = parse_url($allowedOrigin);
            if (
                $configured !== false
                && ($configured['scheme'] ?? '') === 'http'
                && in_array($configured['host'] ?? '', ['localhost', '127.0.0.1'], true)
                && ($configured['port'] ?? 80) === $requestedPort
            ) {
                return true;
            }
        }

        return false;
    }
}
