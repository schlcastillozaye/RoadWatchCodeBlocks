<?php

namespace RoadWatch\Modules;

use RoadWatch\Support\AppError;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;

/** Persistent, user-scoped in-app notifications. */
class NotificationService
{
    public static function createWorkflow(
        string $userId,
        array $report,
        string $title,
        string $message,
        string $repairStatus
    ): void {
        $location = trim(implode(' · ', array_filter([
            $report['addressText'] ?? null,
            $report['areaLabel'] ?? null,
        ])));
        if ($location === '') {
            $location = number_format((float) $report['latitude'], 5) . ', ' . number_format((float) $report['longitude'], 5);
        }
        $now = Dates::now();
        Db::execute(
            'INSERT INTO `Notification`
                (`id`,`userId`,`assignmentId`,`reportId`,`title`,`message`,`category`,`location`,`repairStatus`,`readAt`,`expiresAt`,`createdAt`)
             VALUES (?,?,NULL,?,?,?,?,?,?,NULL,?,?)',
            [
                Ids::cuid(),
                $userId,
                $report['id'],
                $title,
                $message,
                $report['category'],
                mb_substr($location, 0, 500),
                $repairStatus,
                Dates::toDb($now->modify('+5 minutes')),
                Dates::toDb($now),
            ]
        );
    }

    public static function createAssignment(array $assignment, array $report): void
    {
        $location = trim(implode(' · ', array_filter([
            $report['addressText'] ?? null,
            $report['areaLabel'] ?? null,
        ])));
        if ($location === '') {
            $location = number_format((float) $report['latitude'], 5) . ', ' . number_format((float) $report['longitude'], 5);
        }
        $location = mb_substr($location, 0, 500);

        Db::execute(
            'INSERT INTO `Notification`
                (`id`,`userId`,`assignmentId`,`reportId`,`title`,`message`,`category`,`location`,`repairStatus`,`readAt`,`expiresAt`,`createdAt`)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                Ids::cuid(),
                $assignment['officerId'],
                $assignment['id'],
                $report['id'],
                'New road issue assigned',
                $report['referenceNo'] . ' · ' . $report['category'] . ' · ' . $location,
                $report['category'],
                $location,
                'AWAITING_MAINTENANCE',
                null,
                Dates::toDb(Dates::now()->modify('+5 minutes')),
                Dates::toDb(Dates::now()),
            ]
        );
    }

    public static function listForUser(string $userId, int $limit = 50): array
    {
        $limit = max(1, min(100, $limit));
        $items = Db::all(
            "SELECT n.`id`, n.`assignmentId`, n.`reportId`, n.`title`, n.`message`, n.`category`,
                    n.`location`, n.`repairStatus`, n.`readAt`, n.`createdAt`, n.`expiresAt`, r.`referenceNo`
             FROM `Notification` n
             INNER JOIN `Report` r ON r.`id` = n.`reportId`
             WHERE n.`userId` = ? AND n.`expiresAt` > ?
             ORDER BY n.`createdAt` DESC
             LIMIT {$limit}",
            [$userId, Dates::toDb(Dates::now())]
        );
        foreach ($items as &$item) {
            $item['isRead'] = $item['readAt'] !== null;
            $item['expiresAt'] = Dates::iso($item['expiresAt']);
            $item['createdAt'] = Dates::iso($item['createdAt']);
            $item['readAt'] = Dates::iso($item['readAt']);
        }
        unset($item);

        return [
            'items' => $items,
            'unreadCount' => (int) Db::scalar(
                'SELECT COUNT(*) FROM `Notification` WHERE `userId` = ? AND `readAt` IS NULL AND `expiresAt` > ?',
                [$userId, Dates::toDb(Dates::now())]
            ),
        ];
    }

    public static function markRead(string $notificationId, string $userId): array
    {
        $notification = Db::one(
            'SELECT `id`, `reportId`, `readAt` FROM `Notification` WHERE `id` = ? AND `userId` = ?',
            [$notificationId, $userId]
        );
        if ($notification === null) {
            throw AppError::notFound('Notification not found.');
        }
        if ($notification['readAt'] === null) {
            Db::execute(
                'UPDATE `Notification` SET `readAt` = ? WHERE `id` = ? AND `userId` = ? AND `readAt` IS NULL',
                [Dates::toDb(Dates::now()), $notificationId, $userId]
            );
        }

        return self::listForUser($userId);
    }

    public static function markAllRead(string $userId): array
    {
        Db::execute(
            'UPDATE `Notification` SET `readAt` = ? WHERE `userId` = ? AND `readAt` IS NULL',
            [Dates::toDb(Dates::now()), $userId]
        );
        return self::listForUser($userId);
    }
}
