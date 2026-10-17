<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\AccountService;
use RoadWatch\Support\Audit;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Request;
use RoadWatch\Support\Response;
use RoadWatch\Support\Validate;

class AuthController
{
    private static function meta(): array
    {
        return ['userAgent' => Request::userAgent(), 'ipAddress' => Request::ip()];
    }

    public static function register(): array
    {
        $body = Request::body();
        $fullName = Validate::string($body['fullName'] ?? null, 'fullName', true, 2, 120, 'Full name is required', null, 'Full name is required');
        $email = strtolower((string) Validate::string($body['email'] ?? null, 'email', true, 0, 190, null, null, 'A valid email is required'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Validate::fail('email', 'A valid email is required');
        }
        $phone = Validate::string($body['phone'] ?? null, 'phone', false, 0, 30);
        $password = self::validatePassword($body['password'] ?? null, 'password', 'Password must be at least 8 characters');

        $result = AccountService::register([
            'fullName' => $fullName,
            'email' => $email,
            'phone' => $phone,
            'password' => $password,
        ], self::meta());

        Audit::record(array_merge([
            'actorId' => $result['user']['id'],
            'actorRole' => 'CITIZEN',
            'action' => 'USER_REGISTERED',
            'entityType' => 'User',
            'entityId' => $result['user']['id'],
        ], Audit::actorContext()));

        Response::status(201);
        return $result;
    }

    public static function login(): array
    {
        $body = Request::body();
        $email = strtolower((string) Validate::string($body['email'] ?? null, 'email', true, 0, 190, null, null, 'A valid email is required'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Validate::fail('email', 'A valid email is required');
        }
        $password = $body['password'] ?? null;
        if (!is_string($password) || $password === '') {
            Validate::fail('password', 'Password is required');
        }
        if (mb_strlen($password) > 128) {
            Validate::fail('password', 'password must be at most 128 characters.');
        }

        $result = AccountService::login(['email' => $email, 'password' => $password], self::meta());

        Audit::record(array_merge([
            'actorId' => $result['user']['id'],
            'actorRole' => $result['user']['role'],
            'action' => 'USER_LOGIN',
            'entityType' => 'User',
            'entityId' => $result['user']['id'],
        ], Audit::actorContext()));

        return $result;
    }

    public static function refresh(): array
    {
        $body = Request::body();
        $token = Validate::string($body['refreshToken'] ?? null, 'refreshToken', true, 10, PHP_INT_MAX, null, null, 'Refresh token is required');
        return AccountService::refresh($token, self::meta());
    }

    public static function logout(): array
    {
        $body = Request::body();
        $token = Validate::string($body['refreshToken'] ?? null, 'refreshToken', true, 10, PHP_INT_MAX, null, null, 'Refresh token is required');
        AccountService::logout($token);
        return ['success' => true];
    }

    public static function me(): array
    {
        $auth = Auth::authenticate();
        return ['user' => AccountService::currentUser($auth['id'])];
    }

    /** Shared password rule for register/reset endpoints. */
    public static function validatePassword($value, string $field, string $minMessage): string
    {
        if (!is_string($value) || mb_strlen($value) < 8) {
            Validate::fail($field, $minMessage);
        }
        if (mb_strlen($value) > 128) {
            Validate::fail($field, $field . ' must be at most 128 characters.');
        }
        return $value;
    }
}
