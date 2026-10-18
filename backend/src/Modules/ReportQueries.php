<?php

namespace RoadWatch\Modules;

use RoadWatch\Support\Db;

/**
 * Loads report rows together with their photos and related users, batching the
 * related lookups so list endpoints stay efficient.
 */
class ReportQueries
{
    /** @return array<string,mixed>|null */
    public static function find(string $id): ?array
    {
        $report = Db::one('SELECT * FROM `Report` WHERE `id` = ?', [$id]);
        if ($report === null) {
            return null;
        }
        $hydrated = self::hydrateMany([$report]);
        return $hydrated[0];
    }

    /**
     * @param array<int,array<string,mixed>> $reports
     * @return array<int,array<string,mixed>>
     */
    public static function hydrateMany(array $reports): array
    {
        if (empty($reports)) {
            return [];
        }

        $reportIds = array_values(array_filter(array_map(static fn ($r) => $r['id'] ?? null, $reports)));
        $userIds = [];
        foreach ($reports as $report) {
            foreach (['citizenId', 'assignedOfficerId', 'moderatedById'] as $key) {
                if (!empty($report[$key])) {
                    $userIds[$report[$key]] = true;
                }
            }
        }
        $userIds = array_keys($userIds);

        $photosByReport = [];
        if ($reportIds) {
            $rows = Db::all(
                'SELECT `id`, `reportId`, `kind`, `storageKey`, `mimeType`, `sizeBytes`, `width`, `height`,
                        `blurData`, `caption`, `uploadedById`, `createdAt`
                 FROM `ReportPhoto`
                 WHERE `reportId` IN (' . Db::placeholders($reportIds) . ')
                 ORDER BY `createdAt` ASC',
                $reportIds
            );
            foreach ($rows as $row) {
                $photosByReport[$row['reportId']][] = $row;
            }
        }

        $users = [];
        if ($userIds) {
            $rows = Db::all(
                'SELECT `id`, `fullName`, `email` FROM `User` WHERE `id` IN (' . Db::placeholders($userIds) . ')',
                $userIds
            );
            foreach ($rows as $row) {
                $users[$row['id']] = $row;
            }
        }

        $out = [];
        foreach ($reports as $report) {
            $report['photos'] = $photosByReport[$report['id']] ?? [];
            $report['citizen'] = (!empty($report['citizenId']) && isset($users[$report['citizenId']])) ? $users[$report['citizenId']] : null;
            $report['assignedOfficer'] = (!empty($report['assignedOfficerId']) && isset($users[$report['assignedOfficerId']])) ? $users[$report['assignedOfficerId']] : null;
            $report['moderatedBy'] = (!empty($report['moderatedById']) && isset($users[$report['moderatedById']])) ? $users[$report['moderatedById']] : null;
            $out[] = $report;
        }
        return $out;
    }
}
