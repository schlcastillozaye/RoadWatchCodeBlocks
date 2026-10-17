<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\ReportService;
use RoadWatch\Support\Auth;

class MaintenanceController
{
    public static function assignments(): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        return ReportService::listAssignmentsForOfficer($actor['id'], ReportService::parseListQuery());
    }

    public static function summary(): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        return ReportService::officerSummary($actor['id']);
    }
}
