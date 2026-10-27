<?php

namespace RoadWatch\Modules;

use RoadWatch\Support\AppError;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Config;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;
use RoadWatch\Support\Jwt;
use RoadWatch\Support\Ttl;

/** Authentication: register, login, refresh (rotating), logout, current user. */
class AccountService
{
    private const BCRYPT_ROUNDS = 10;

    public static function hashPassword(string $plain): string
    {
        return password_hash($plain, PASSWORD_BCRYPT, ['cost' => self::BCRYPT_ROUNDS]);
    }

    public static function verifyPassword(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }

    private static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    private static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private static function refreshExpiry(): string
    {
        $seconds = Ttl::toSeconds(Config::jwtRefreshTtl(), 30 * 86400);
        return Dates::toDb(Dates::now()->modify('+' . $seconds . ' seconds'));
    }

    /**
     * @param array<string,mixed> $user
     * @return array{user:array,accessToken:string,refreshToken:string}
     */
    private static function issueTokens(array $user, array $meta = []): array
    {
        $jti = self::uuid();
        $accessToken = Auth::signAccessToken($user);
        $refreshToken = Auth::signRefreshToken($user['id'], $jti);

        Db::execute(
            'INSERT INTO `RefreshToken` (`id`,`userId`,`tokenHash`,`expiresAt`,`revokedAt`,`userAgent`,`ipAddress`,`createdAt`)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                Ids::cuid(),
                $user['id'],
                self::hashToken($refreshToken),
                self::refreshExpiry(),
                null,
                $meta['userAgent'] ?? null,
                $meta['ipAddress'] ?? null,
                Dates::toDb(Dates::now()),
            ]
        );

        return [
            'user' => Dto::user($user),
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken,
        ];
    }

    public static function register(array $input): array
    {
        $existing = Db::one('SELECT `id` FROM `User` WHERE `email` = ?', [$input['email']]);
        if ($existing !== null) {
            throw AppError::conflict('An account with this email already exists.');
        }

        $now = Dates::toDb(Dates::now());
        $id = Ids::cuid();
        Db::execute(
            'INSERT INTO `User` (`id`,`fullName`,`email`,`phone`,`passwordHash`,`role`,`status`,`avatarKey`,`createdAt`,`updatedAt`)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            [
                $id,
                $input['fullName'],
                $input['email'],
                $input['phone'] ?? null,
                self::hashPassword($input['password']),
                'CITIZEN',
                'ACTIVE',
                null,
                $now,
                $now,
            ]
        );

        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$id]);
        return ['user' => Dto::user($user)];
    }

    public static function login(array $input, array $meta = []): array
    {
        $user = Db::one('SELECT * FROM `User` WHERE `email` = ?', [$input['email']]);
        if ($user === null) {
            throw AppError::unauthenticated('Invalid email or password.');
        }
        if (!self::verifyPassword($input['password'], $user['passwordHash'])) {
            throw AppError::unauthenticated('Invalid email or password.');
        }
        if ($user['status'] === 'SUSPENDED') {
            throw AppError::forbidden('This account has been suspended. Contact an administrator.');
        }
        return self::issueTokens($user, $meta);
    }

    public static function refresh(string $refreshToken, array $meta = []): array
    {
        $payload = Jwt::verify($refreshToken, Config::jwtRefreshSecret());
        if ($payload === null || ($payload['type'] ?? null) !== 'refresh') {
            throw AppError::unauthenticated('Invalid or expired refresh token');
        }

        $tokenHash = self::hashToken($refreshToken);
        $stored = Db::one('SELECT * FROM `RefreshToken` WHERE `tokenHash` = ?', [$tokenHash]);
        if ($stored === null || !empty($stored['revokedAt'])) {
            throw AppError::unauthenticated('Refresh token is no longer valid.');
        }
        $expiresAt = strtotime((string) $stored['expiresAt'] . ' UTC');
        if ($expiresAt !== false && $expiresAt < time()) {
            throw AppError::unauthenticated('Refresh token is no longer valid.');
        }

        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [(string) $payload['sub']]);
        if ($user === null || $user['status'] === 'SUSPENDED') {
            throw AppError::unauthenticated('Account is not available.');
        }

        Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `id` = ?', [Dates::toDb(Dates::now()), $stored['id']]);

        return self::issueTokens($user, $meta);
    }

    public static function logout(string $refreshToken): void
    {
        try {
            Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `tokenHash` = ? AND `revokedAt` IS NULL', [
                Dates::toDb(Dates::now()),
                self::hashToken($refreshToken),
            ]);
        } catch (\Throwable $e) {
            // best effort
        }
    }

    public static function logoutAll(string $userId): void
    {
        Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `userId` = ? AND `revokedAt` IS NULL', [
            Dates::toDb(Dates::now()),
            $userId,
        ]);
    }

    public static function currentUser(string $userId): array
    {
        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$userId]);
        if ($user === null) {
            throw AppError::notFound('User not found.');
        }
        return Dto::user($user);
    }
}
