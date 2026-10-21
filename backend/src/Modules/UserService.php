<?php

namespace RoadWatch\Modules;

use RoadWatch\Support\AppError;
use RoadWatch\Support\Audit;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;

/** User administration + self-service profile management. */
class UserService
{
    public static function parseListQuery(): array
    {
        $raw = \RoadWatch\Support\Request::query();
        $page = max(1, (int) ($raw['page'] ?? 1));
        $pageSize = max(1, min(100, (int) ($raw['pageSize'] ?? 20)));
        $search = null;
        if (isset($raw['search']) && trim((string) $raw['search']) !== '') {
            $search = mb_substr(trim((string) $raw['search']), 0, 200);
        }
        return [
            'page' => $page,
            'pageSize' => $pageSize,
            'role' => \RoadWatch\Support\Validate::enum($raw['role'] ?? null, 'role', Schema::ROLES, false),
            'status' => \RoadWatch\Support\Validate::enum($raw['status'] ?? null, 'status', Schema::USER_STATUSES, false),
            'search' => $search,
        ];
    }

    public static function list(array $q): array
    {
        $clauses = [];
        $params = [];
        if (!empty($q['role'])) {
            $clauses[] = '`role` = ?';
            $params[] = $q['role'];
        }
        if (!empty($q['status'])) {
            $clauses[] = '`status` = ?';
            $params[] = $q['status'];
        }
        if (!empty($q['search'])) {
            $s = '%' . $q['search'] . '%';
            $clauses[] = '(`fullName` LIKE ? OR `email` LIKE ? OR `phone` LIKE ?)';
            array_push($params, $s, $s, $s);
        }
        $where = empty($clauses) ? '' : (' WHERE ' . implode(' AND ', $clauses));

        $total = (int) Db::scalar('SELECT COUNT(*) FROM `User`' . $where, $params);
        $offset = ($q['page'] - 1) * $q['pageSize'];
        $limit = (int) $q['pageSize'];
        $rows = Db::all('SELECT * FROM `User`' . $where . " ORDER BY `createdAt` DESC LIMIT {$limit} OFFSET {$offset}", $params);

        return [
            'items' => array_map(static fn ($u) => Dto::user($u), $rows),
            'total' => $total,
            'page' => $q['page'],
            'pageSize' => $q['pageSize'],
            'totalPages' => max(1, (int) ceil($total / $q['pageSize'])),
        ];
    }

    public static function listOfficers(): array
    {
        $rows = Db::all("SELECT * FROM `User` WHERE `role` = 'MAINTENANCE_OFFICER' AND `status` = 'ACTIVE' ORDER BY `fullName` ASC");
        $out = [];
        foreach ($rows as $officer) {
            $active = (int) Db::scalar(
                "SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ? AND `repairStatus` IN ('AWAITING_MAINTENANCE','IN_PROGRESS')",
                [$officer['id']]
            );
            $completed = (int) Db::scalar(
                "SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ? AND `repairStatus` = 'COMPLETED'",
                [$officer['id']]
            );
            $dto = Dto::user($officer);
            $dto['activeAssignments'] = $active;
            $dto['completedAssignments'] = $completed;
            $out[] = $dto;
        }
        return $out;
    }

    public static function create(array $actor, array $input): array
    {
        if (($input['role'] ?? 'MAINTENANCE_OFFICER') === 'ADMIN') {
            throw AppError::forbidden('Administrator accounts cannot be created through user management.');
        }
        $existing = Db::one('SELECT `id` FROM `User` WHERE `email` = ?', [$input['email']]);
        if ($existing !== null) {
            throw AppError::conflict('A user with this email already exists.');
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
                AccountService::hashPassword($input['password']),
                $input['role'] ?? 'MAINTENANCE_OFFICER',
                'ACTIVE',
                null,
                $now,
                $now,
            ]
        );

        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$id]);

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'USER_CREATED',
            'entityType' => 'User',
            'entityId' => $id,
            'metadata' => ['role' => $user['role'], 'email' => $user['email']],
        ], Audit::actorContext()));

        return Dto::user($user);
    }

    public static function update(array $actor, string $userId, array $input): array
    {
        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$userId]);
        if ($user === null) {
            throw AppError::notFound('User not found.');
        }
        if ($user['role'] === 'ADMIN') {
            throw AppError::forbidden('Administrator accounts cannot be changed through user management.');
        }
        if (($input['role'] ?? null) === 'ADMIN') {
            throw AppError::forbidden('Users cannot be promoted to administrator through user management.');
        }
        if ($userId === $actor['id'] && ($input['status'] ?? null) === 'SUSPENDED') {
            throw AppError::badRequest('You cannot suspend your own account.');
        }

        $sets = ['`updatedAt` = ?'];
        $params = [Dates::toDb(Dates::now())];
        if (!empty($input['fullName'])) {
            $sets[] = '`fullName` = ?';
            $params[] = $input['fullName'];
        }
        if (array_key_exists('phone', $input)) {
            $sets[] = '`phone` = ?';
            $params[] = $input['phone'] === '' ? null : $input['phone'];
        }
        if (!empty($input['role'])) {
            $sets[] = '`role` = ?';
            $params[] = $input['role'];
        }
        if (!empty($input['status'])) {
            $sets[] = '`status` = ?';
            $params[] = $input['status'];
        }
        $params[] = $userId;
        Db::execute('UPDATE `User` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $params);
        if (($input['status'] ?? null) === 'SUSPENDED') {
            Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `userId` = ? AND `revokedAt` IS NULL', [
                Dates::toDb(Dates::now()),
                $userId,
            ]);
        }

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'USER_UPDATED',
            'entityType' => 'User',
            'entityId' => $userId,
            'metadata' => ['changes' => $input],
        ], Audit::actorContext()));

        return Dto::user(Db::one('SELECT * FROM `User` WHERE `id` = ?', [$userId]));
    }

    public static function adminResetPassword(array $actor, string $userId, string $newPassword): array
    {
        $user = Db::one('SELECT `id`,`role` FROM `User` WHERE `id` = ?', [$userId]);
        if ($user === null) {
            throw AppError::notFound('User not found.');
        }
        if ($user['role'] === 'ADMIN') {
            throw AppError::forbidden('Administrator passwords cannot be changed through user management.');
        }
        Db::execute('UPDATE `User` SET `passwordHash` = ?, `updatedAt` = ? WHERE `id` = ?', [
            AccountService::hashPassword($newPassword),
            Dates::toDb(Dates::now()),
            $userId,
        ]);
        Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `userId` = ? AND `revokedAt` IS NULL', [
            Dates::toDb(Dates::now()),
            $userId,
        ]);

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'PASSWORD_RESET',
            'entityType' => 'User',
            'entityId' => $userId,
        ], Audit::actorContext()));

        return ['success' => true];
    }

    public static function updateOwnProfile(string $userId, array $input): array
    {
        $sets = ['`updatedAt` = ?'];
        $params = [Dates::toDb(Dates::now())];
        if (!empty($input['fullName'])) {
            $sets[] = '`fullName` = ?';
            $params[] = $input['fullName'];
        }
        if (array_key_exists('phone', $input)) {
            $sets[] = '`phone` = ?';
            $params[] = $input['phone'] === '' ? null : $input['phone'];
        }
        $params[] = $userId;
        Db::execute('UPDATE `User` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $params);
        return Dto::user(Db::one('SELECT * FROM `User` WHERE `id` = ?', [$userId]));
    }

    public static function changeOwnPassword(string $userId, array $input): array
    {
        $user = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$userId]);
        if ($user === null) {
            throw AppError::notFound('User not found.');
        }
        if (!AccountService::verifyPassword($input['currentPassword'], $user['passwordHash'])) {
            throw AppError::unauthenticated('Current password is incorrect.');
        }
        Db::execute('UPDATE `User` SET `passwordHash` = ?, `updatedAt` = ? WHERE `id` = ?', [
            AccountService::hashPassword($input['newPassword']),
            Dates::toDb(Dates::now()),
            $userId,
        ]);
        Db::execute('UPDATE `RefreshToken` SET `revokedAt` = ? WHERE `userId` = ? AND `revokedAt` IS NULL', [
            Dates::toDb(Dates::now()),
            $userId,
        ]);
        return ['success' => true];
    }
}
