<?php

namespace RoadWatch\Support;

/**
 * JWT auth helpers. Access tokens carry {sub, role, email, fullName}; refresh
 * tokens carry {sub, type:"refresh", jti}.
 */
class Auth
{
    public static function signAccessToken(array $user): string
    {
        return Jwt::sign([
            'sub' => $user['id'],
            'role' => $user['role'],
            'email' => $user['email'],
            'fullName' => $user['fullName'],
        ], Config::jwtAccessSecret(), Ttl::toSeconds(Config::jwtAccessTtl(), 900));
    }

    public static function signRefreshToken(string $userId, string $jti): string
    {
        return Jwt::sign([
            'sub' => $userId,
            'type' => 'refresh',
            'jti' => $jti,
        ], Config::jwtRefreshSecret(), Ttl::toSeconds(Config::jwtRefreshTtl(), 30 * 86400));
    }

    /** @return array{id:string,role:string,email:string,fullName:string} */
    public static function authenticate(): array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            throw AppError::unauthenticated();
        }
        $payload = Jwt::verify($token, Config::jwtAccessSecret());
        if ($payload === null) {
            throw AppError::unauthenticated('Invalid or expired access token');
        }
        $auth = [
            'id' => (string) ($payload['sub'] ?? ''),
            'role' => (string) ($payload['role'] ?? 'CITIZEN'),
            'email' => (string) ($payload['email'] ?? ''),
            'fullName' => (string) ($payload['fullName'] ?? ''),
        ];
        Request::$auth = $auth;
        return $auth;
    }

    /** Attach auth when a valid token is present; never reject. */
    public static function optionalAuthenticate(): ?array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return null;
        }
        $payload = Jwt::verify($token, Config::jwtAccessSecret());
        if ($payload === null || !isset($payload['sub'])) {
            return null;
        }
        $auth = [
            'id' => (string) $payload['sub'],
            'role' => (string) ($payload['role'] ?? 'CITIZEN'),
            'email' => (string) ($payload['email'] ?? ''),
            'fullName' => (string) ($payload['fullName'] ?? ''),
        ];
        Request::$auth = $auth;
        return $auth;
    }

    /** @return array{id:string,role:string,email:string,fullName:string} */
    public static function requireRole(string ...$roles): array
    {
        $auth = self::authenticate();
        if (!in_array($auth['role'], $roles, true)) {
            throw AppError::forbidden('Requires one of roles: ' . implode(', ', $roles));
        }
        return $auth;
    }

    public static function requireAdmin(): array
    {
        return self::requireRole('ADMIN');
    }

    public static function requireStaff(): array
    {
        return self::requireRole('ADMIN', 'MAINTENANCE_OFFICER');
    }
}
