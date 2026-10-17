<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\AccountService;
use RoadWatch\Modules\UserService;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Response;
use RoadWatch\Support\Validate;

class UsersController
{
    public static function me(): array
    {
        $auth = Auth::authenticate();
        return ['user' => AccountService::currentUser($auth['id'])];
    }

    public static function updateMe(): array
    {
        $auth = Auth::authenticate();
        $body = \RoadWatch\Support\Request::body();
        $input = [];
        if (array_key_exists('fullName', $body) && $body['fullName'] !== null && $body['fullName'] !== '') {
            $input['fullName'] = Validate::string($body['fullName'], 'fullName', true, 2, 120);
        }
        if (array_key_exists('phone', $body)) {
            $input['phone'] = Validate::string($body['phone'], 'phone', false, 0, 30) ?? '';
        }
        return ['user' => UserService::updateOwnProfile($auth['id'], $input)];
    }

    public static function changePassword(): array
    {
        $auth = Auth::authenticate();
        $body = \RoadWatch\Support\Request::body();
        $current = $body['currentPassword'] ?? null;
        if (!is_string($current) || $current === '') {
            Validate::fail('currentPassword', 'Current password is required');
        }
        $new = AuthController::validatePassword($body['newPassword'] ?? null, 'newPassword', 'New password must be at least 8 characters');
        return UserService::changeOwnPassword($auth['id'], ['currentPassword' => $current, 'newPassword' => $new]);
    }

    public static function officers(): array
    {
        Auth::requireAdmin();
        return ['officers' => UserService::listOfficers()];
    }

    public static function index(): array
    {
        Auth::requireAdmin();
        return UserService::list(UserService::parseListQuery());
    }

    public static function create(): array
    {
        $actor = Auth::requireAdmin();
        $body = \RoadWatch\Support\Request::body();
        $fullName = Validate::string($body['fullName'] ?? null, 'fullName', true, 2, 120);
        $email = strtolower((string) Validate::string($body['email'] ?? null, 'email', true, 0, 190, null, null, 'A valid email is required'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Validate::fail('email', 'A valid email is required');
        }
        $phone = Validate::string($body['phone'] ?? null, 'phone', false, 0, 30);
        $password = AuthController::validatePassword($body['password'] ?? null, 'password', 'Password must be at least 8 characters');
        $role = Validate::enum($body['role'] ?? null, 'role', \RoadWatch\Modules\Schema::ROLES, false) ?? 'MAINTENANCE_OFFICER';

        Response::status(201);
        return ['user' => UserService::create($actor, [
            'fullName' => $fullName,
            'email' => $email,
            'phone' => $phone,
            'password' => $password,
            'role' => $role,
        ])];
    }

    public static function update(array $params): array
    {
        $actor = Auth::requireAdmin();
        $body = \RoadWatch\Support\Request::body();
        $input = [];
        if (array_key_exists('fullName', $body) && $body['fullName'] !== null && $body['fullName'] !== '') {
            $input['fullName'] = Validate::string($body['fullName'], 'fullName', true, 2, 120);
        }
        if (array_key_exists('phone', $body)) {
            $input['phone'] = Validate::string($body['phone'], 'phone', false, 0, 30) ?? '';
        }
        if (array_key_exists('role', $body) && $body['role'] !== null && $body['role'] !== '') {
            $input['role'] = Validate::enum($body['role'], 'role', \RoadWatch\Modules\Schema::ROLES);
        }
        if (array_key_exists('status', $body) && $body['status'] !== null && $body['status'] !== '') {
            $input['status'] = Validate::enum($body['status'], 'status', \RoadWatch\Modules\Schema::USER_STATUSES);
        }
        Validate::string($params['id'], 'id', true, 1);
        return ['user' => UserService::update($actor, $params['id'], $input)];
    }

    public static function resetPassword(array $params): array
    {
        $actor = Auth::requireAdmin();
        $body = \RoadWatch\Support\Request::body();
        $new = AuthController::validatePassword($body['newPassword'] ?? null, 'newPassword', 'Password must be at least 8 characters');
        return UserService::adminResetPassword($actor, $params['id'], $new);
    }
}
