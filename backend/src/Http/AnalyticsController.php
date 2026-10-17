<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\ReportService;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Request;

class AnalyticsController
{
    public static function summary(): array
    {
        Auth::requireAdmin();
        return ReportService::statistics();
    }

    public static function auditLogs(): array
    {
        Auth::requireAdmin();
        $raw = Request::query('limit');
        $limit = 100;
        if ($raw !== null && $raw !== '' && is_numeric($raw)) {
            $limit = max(1, min(500, (int) $raw));
        }
        return ['logs' => ReportService::listAuditLogs($limit)];
    }
}
