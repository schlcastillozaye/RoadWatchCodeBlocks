<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\NotificationService;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Request;
use RoadWatch\Support\Validate;

class NotificationsController
{
    public static function index(): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        $limit = Request::query('limit');
        if ($limit === null || $limit === '') {
            $limit = 50;
        } else {
            $limit = Validate::string($limit, 'limit', true, 1, 3);
            if (!ctype_digit($limit) || (int) $limit < 1 || (int) $limit > 100) {
                Validate::fail('limit', 'Limit must be an integer between 1 and 100.');
            }
            $limit = (int) $limit;
        }
        return NotificationService::listForUser($actor['id'], $limit);
    }

    public static function markRead(array $params): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        return NotificationService::markRead($params['id'], $actor['id']);
    }

    public static function markAllRead(): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        return NotificationService::markAllRead($actor['id']);
    }
}
