<?php

namespace RoadWatch\Modules;

use RoadWatch\Services\ImageProcessing;
use RoadWatch\Services\Storage;
use RoadWatch\Support\AppError;
use RoadWatch\Support\Audit;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;
use RoadWatch\Support\ImageMeta;
use RoadWatch\Support\Reference;
use RoadWatch\Support\Request;
use RoadWatch\Support\Validate;

/**
 * Report domain logic: visibility, submission, moderation, assignment and
 * maintenance. Mirrors the original Node `reports/service.ts` rules exactly.
 */
class ReportService
{
    // -----------------------------------------------------------------------
    //  Access control
    // -----------------------------------------------------------------------

    public static function isPubliclyVisible(string $status): bool
    {
        return $status === 'APPROVED';
    }

    public static function canViewReport(array $report, ?array $actor): bool
    {
        if ($actor === null) {
            return self::isPubliclyVisible((string) $report['moderationStatus']);
        }
        if (($actor['role'] ?? null) === 'ADMIN') {
            return true;
        }
        if (($actor['role'] ?? null) === 'MAINTENANCE_OFFICER') {
            return ($report['assignedOfficerId'] ?? null) === $actor['id']
                || self::isPubliclyVisible((string) $report['moderationStatus']);
        }
        return ($report['citizenId'] ?? null) === $actor['id'];
    }

    public static function getOrThrow(string $id): array
    {
        $report = ReportQueries::find($id);
        if ($report === null) {
            throw AppError::notFound('Report not found.');
        }
        return $report;
    }

    public static function getForActor(string $id, ?array $actor): array
    {
        $report = self::getOrThrow($id);
        if (!self::canViewReport($report, $actor)) {
            throw AppError::forbidden('You do not have access to this report.');
        }
        return Dto::report($report, $actor === null);
    }

    /**
     * Report detail for any viewer (anonymous or signed in).
     *
     * Approved reports are public, so a signed-in citizen opening someone
     * else's approved report must still be allowed (previously returned 403).
     * The richer staff/owner view is returned when the caller is authorised;
     * otherwise approved reports fall back to the public view, and
     * non-approved reports stay forbidden.
     */
    public static function getForViewer(string $id, ?array $actor): array
    {
        $report = self::getOrThrow($id);
        if (self::canViewReport($report, $actor)) {
            return Dto::report($report, $actor === null);
        }
        if (self::isPubliclyVisible((string) $report['moderationStatus'])) {
            return Dto::report($report, true);
        }
        throw AppError::forbidden('You do not have access to this report.');
    }

    /**
     * Public map detail: only approved reports are exposed, and anything else
     * (missing, pending or rejected) answers 404 so existence is not leaked.
     */
    public static function getPublicMapDetail(string $id): array
    {
        $report = ReportQueries::find($id);
        if ($report === null || !self::isPubliclyVisible((string) $report['moderationStatus'])) {
            throw AppError::notFound('Report not available.');
        }
        return Dto::report($report, true);
    }

    public static function getHistory(string $id, ?array $actor): array
    {
        self::getForViewer($id, $actor);
        $rows = Db::all(
            'SELECT h.*, u.`fullName` AS actor_fullName
             FROM `StatusHistory` h
             LEFT JOIN `User` u ON u.`id` = h.`actorId`
             WHERE h.`reportId` = ?
             ORDER BY h.`createdAt` ASC',
            [$id]
        );
        return array_map(static function (array $row): array {
            $row['actor'] = !empty($row['actorId']) ? ['id' => $row['actorId'], 'fullName' => $row['actor_fullName']] : null;
            return Dto::history($row);
        }, $rows);
    }

    // -----------------------------------------------------------------------
    //  List query parsing + filtering
    // -----------------------------------------------------------------------

    public static function parseListQuery(): array
    {
        $raw = Request::query();
        $page = self::clampInt($raw['page'] ?? null, 1, 1, PHP_INT_MAX);
        $pageSize = self::clampInt($raw['pageSize'] ?? null, 20, 1, 100);

        $search = null;
        if (isset($raw['search']) && trim((string) $raw['search']) !== '') {
            $search = mb_substr(trim((string) $raw['search']), 0, 200);
        }
        $areaLabel = null;
        if (isset($raw['areaLabel']) && trim((string) $raw['areaLabel']) !== '') {
            $areaLabel = mb_substr(trim((string) $raw['areaLabel']), 0, 160);
        }

        $sort = in_array(($raw['sort'] ?? ''), ['newest', 'oldest', 'priority'], true) ? $raw['sort'] : 'newest';

        return [
            'page' => $page,
            'pageSize' => $pageSize,
            'search' => $search,
            'category' => Validate::enum($raw['category'] ?? null, 'category', Schema::CATEGORIES, false),
            'priority' => Validate::enum($raw['priority'] ?? null, 'priority', Schema::PRIORITIES, false),
            'moderationStatus' => Validate::enum($raw['moderationStatus'] ?? null, 'moderationStatus', Schema::MODERATION_STATUSES, false),
            'repairStatus' => Validate::enum($raw['repairStatus'] ?? null, 'repairStatus', Schema::REPAIR_STATUSES, false),
            'areaLabel' => $areaLabel,
            'assignedOfficerId' => isset($raw['assignedOfficerId']) ? mb_substr(trim((string) $raw['assignedOfficerId']), 0, 40) : null,
            'citizenId' => isset($raw['citizenId']) ? mb_substr(trim((string) $raw['citizenId']), 0, 40) : null,
            'from' => Validate::date($raw['from'] ?? null, 'from', false),
            'to' => Validate::date($raw['to'] ?? null, 'to', false),
            'sort' => $sort,
        ];
    }

    private static function clampInt($value, int $default, int $min, int $max): int
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return $default;
        }
        $value = (int) $value;
        return max($min, min($max, $value));
    }

    /** @return array{0:string,1:array<int,mixed>} */
    private static function commonFilters(array $q): array
    {
        $clauses = [];
        $params = [];
        if (!empty($q['category'])) {
            $clauses[] = '`category` = ?';
            $params[] = $q['category'];
        }
        if (!empty($q['priority'])) {
            $clauses[] = '`priority` = ?';
            $params[] = $q['priority'];
        }
        if (!empty($q['moderationStatus'])) {
            $clauses[] = '`moderationStatus` = ?';
            $params[] = $q['moderationStatus'];
        }
        if (!empty($q['repairStatus'])) {
            $clauses[] = '`repairStatus` = ?';
            $params[] = $q['repairStatus'];
        }
        if (!empty($q['areaLabel'])) {
            $clauses[] = '`areaLabel` LIKE ?';
            $params[] = '%' . $q['areaLabel'] . '%';
        }
        if (!empty($q['from'])) {
            $clauses[] = '`createdAt` >= ?';
            $params[] = Dates::toDb($q['from']);
        }
        if (!empty($q['to'])) {
            $clauses[] = '`createdAt` <= ?';
            $params[] = Dates::toDb($q['to']);
        }
        if (!empty($q['search'])) {
            $s = '%' . $q['search'] . '%';
            $clauses[] = '(`title` LIKE ? OR `description` LIKE ? OR `referenceNo` LIKE ? OR `addressText` LIKE ? OR `areaLabel` LIKE ?)';
            array_push($params, $s, $s, $s, $s, $s);
        }
        return [$clauses, $params];
    }

    private static function whereFrom(array $clauses): string
    {
        return empty($clauses) ? '' : (' WHERE ' . implode(' AND ', $clauses));
    }

    private static function orderFor(string $sort): string
    {
        if ($sort === 'oldest') {
            return '`createdAt` ASC';
        }
        if ($sort === 'priority') {
            return '`priority` DESC, `createdAt` DESC';
        }
        return '`createdAt` DESC';
    }

    private static function paginate(string $where, array $params, array $q, string $sort, callable $map): array
    {
        $total = (int) Db::scalar('SELECT COUNT(*) FROM `Report`' . $where, $params);
        $offset = ($q['page'] - 1) * $q['pageSize'];
        $limit = (int) $q['pageSize'];
        $rows = Db::all(
            'SELECT * FROM `Report`' . $where . ' ORDER BY ' . self::orderFor($sort) . " LIMIT {$limit} OFFSET {$offset}",
            $params
        );
        $rows = ReportQueries::hydrateMany($rows);
        return [
            'items' => array_map($map, $rows),
            'total' => $total,
            'page' => $q['page'],
            'pageSize' => $q['pageSize'],
            'totalPages' => max(1, (int) ceil($total / $q['pageSize'])),
        ];
    }

    public static function listForCitizen(string $citizenId, array $q): array
    {
        [$clauses, $params] = self::commonFilters($q);
        array_unshift($clauses, '`citizenId` = ?');
        array_unshift($params, $citizenId);
        return self::paginate(self::whereFrom($clauses), $params, $q, $q['sort'], static fn ($r) => Dto::report($r));
    }

    public static function listForStaff(array $q): array
    {
        [$clauses, $params] = self::commonFilters($q);
        if (!empty($q['assignedOfficerId'])) {
            $clauses[] = '`assignedOfficerId` = ?';
            $params[] = $q['assignedOfficerId'];
        }
        if (!empty($q['citizenId'])) {
            $clauses[] = '`citizenId` = ?';
            $params[] = $q['citizenId'];
        }
        return self::paginate(self::whereFrom($clauses), $params, $q, $q['sort'], static fn ($r) => Dto::report($r));
    }

    public static function listAssignmentsForOfficer(string $officerId, array $q): array
    {
        [$clauses, $params] = self::commonFilters($q);
        $clauses[] = '`assignedOfficerId` = ?';
        $params[] = $officerId;
        $clauses[] = '`moderationStatus` = ?';
        $params[] = 'APPROVED';
        return self::paginate(self::whereFrom($clauses), $params, $q, $q['sort'], static fn ($r) => Dto::report($r));
    }

    public static function listPublic(array $q): array
    {
        $clauses = ['`moderationStatus` = ?'];
        $params = ['APPROVED'];
        if (!empty($q['category'])) {
            $clauses[] = '`category` = ?';
            $params[] = $q['category'];
        }
        if (!empty($q['repairStatus'])) {
            $clauses[] = '`repairStatus` = ?';
            $params[] = $q['repairStatus'];
        }
        if (!empty($q['areaLabel'])) {
            $clauses[] = '`areaLabel` LIKE ?';
            $params[] = '%' . $q['areaLabel'] . '%';
        }
        if (!empty($q['from'])) {
            $clauses[] = '`createdAt` >= ?';
            $params[] = Dates::toDb($q['from']);
        }
        if (!empty($q['to'])) {
            $clauses[] = '`createdAt` <= ?';
            $params[] = Dates::toDb($q['to']);
        }
        if (!empty($q['search'])) {
            $s = '%' . $q['search'] . '%';
            $clauses[] = '(`title` LIKE ? OR `referenceNo` LIKE ? OR `addressText` LIKE ? OR `areaLabel` LIKE ?)';
            array_push($params, $s, $s, $s, $s);
        }
        return self::paginate(self::whereFrom($clauses), $params, $q, $q['sort'], static fn ($r) => Dto::publicSummary($r));
    }

    // -----------------------------------------------------------------------
    //  Submission
    // -----------------------------------------------------------------------

    public static function create(array $actor, array $input, array $files): array
    {
        if (count($files) < 1) {
            throw AppError::badRequest('At least one photo of the issue is required.');
        }

        $stored = self::storeBuffers($files, 'reports');

        $referenceNo = null;
        try {
            $reportId = Db::transaction(function () use ($actor, $input, $stored, &$referenceNo) {
                $referenceNo = Reference::next();
                $id = Ids::cuid();
                $now = Dates::toDb(Dates::now());

                Db::execute(
                    'INSERT INTO `Report`
                        (`id`,`referenceNo`,`title`,`description`,`category`,`priority`,`latitude`,`longitude`,
                         `addressText`,`areaLabel`,`moderationStatus`,`rejectionReason`,`moderatedById`,`moderatedAt`,
                         `repairStatus`,`assignedOfficerId`,`assignedAt`,`completedAt`,`completionNotes`,`completionOverride`,
                         `citizenId`,`createdAt`,`updatedAt`)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [
                        $id,
                        $referenceNo,
                        $input['title'],
                        $input['description'],
                        $input['category'],
                        $input['priority'] ?? 'MEDIUM',
                        $input['latitude'],
                        $input['longitude'],
                        $input['addressText'] ?? null,
                        $input['areaLabel'] ?? null,
                        'PENDING_REVIEW',
                        null,
                        null,
                        null,
                        'NOT_ASSIGNED',
                        null,
                        null,
                        null,
                        null,
                        0,
                        $actor['id'],
                        $now,
                        $now,
                    ]
                );

                foreach ($stored as $p) {
                    Db::execute(
                        'INSERT INTO `ReportPhoto` (`id`,`reportId`,`kind`,`storageKey`,`mimeType`,`sizeBytes`,`width`,`height`,`blurData`,`caption`,`uploadedById`,`createdAt`)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                        [
                            Ids::cuid(),
                            $id,
                            'BEFORE',
                            $p['stored']['key'],
                            $p['stored']['mimeType'],
                            $p['stored']['sizeBytes'],
                            $p['width'],
                            $p['height'],
                            null,
                            null,
                            $actor['id'],
                            $now,
                        ]
                    );
                }

                Audit::history([
                    'reportId' => $id,
                    'type' => 'CREATION',
                    'toValue' => 'PENDING_REVIEW',
                    'note' => 'Report submitted by citizen.',
                    'actorId' => $actor['id'],
                    'actorRole' => $actor['role'],
                ]);

                return $id;
            });
        } catch (\Throwable $e) {
            foreach ($stored as $s) {
                Storage::remove($s['stored']['key']);
            }
            throw $e;
        }

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'REPORT_CREATED',
            'entityType' => 'Report',
            'entityId' => $reportId,
            'metadata' => ['referenceNo' => $referenceNo, 'category' => $input['category']],
        ], Audit::actorContext()));

        $report = self::getOrThrow($reportId);

        if (ImageProcessing::enabled()) {
            foreach ($report['photos'] as $photo) {
                ImageProcessing::schedule($reportId, $photo['id'], Dto::photoUrl($photo['storageKey']));
            }
        }

        return Dto::report($report);
    }

    public static function addPhotos(string $reportId, array $actor, array $files, string $kind): array
    {
        $report = self::getOrThrow($reportId);

        $isOwner = ($report['citizenId'] ?? null) === $actor['id'];
        $isAdmin = ($actor['role'] ?? null) === 'ADMIN';
        $isAssignedOfficer = ($report['assignedOfficerId'] ?? null) === $actor['id'];

        if (!$isOwner && !$isAdmin && !$isAssignedOfficer) {
            throw AppError::forbidden('You cannot add photos to this report.');
        }
        if ($isOwner && !$isAdmin && $kind !== 'BEFORE') {
            throw AppError::forbidden('Only maintenance staff can add progress or completion photos.');
        }
        if ($isOwner && !$isAdmin && $report['moderationStatus'] !== 'PENDING_REVIEW') {
            throw AppError::conflict('Photos can only be added while the report is pending review.');
        }

        $photos = self::persistPhotos($reportId, $files, $kind, $actor['id']);

        Audit::history([
            'reportId' => $reportId,
            'type' => 'REPAIR',
            'toValue' => $report['repairStatus'],
            'note' => $kind . ' photo(s) uploaded (' . count($photos) . ').',
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
        ]);

        return Dto::report(self::getOrThrow($reportId));
    }

    public static function delete(string $reportId, array $actor): array
    {
        $report = self::getOrThrow($reportId);

        if (($actor['role'] ?? null) !== 'ADMIN') {
            if (($report['citizenId'] ?? null) !== $actor['id']) {
                throw AppError::forbidden('You cannot delete this report.');
            }
            if ($report['moderationStatus'] !== 'PENDING_REVIEW') {
                throw AppError::conflict('Only reports still pending review can be withdrawn.');
            }
        }

        Db::execute('DELETE FROM `Report` WHERE `id` = ?', [$reportId]);

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'REPORT_DELETED',
            'entityType' => 'Report',
            'entityId' => $reportId,
            'metadata' => ['referenceNo' => $report['referenceNo']],
        ], Audit::actorContext()));

        return ['success' => true];
    }

    // -----------------------------------------------------------------------
    //  Moderation (ADMIN only)
    // -----------------------------------------------------------------------

    public static function moderate(string $reportId, array $actor, array $input): array
    {
        $report = self::getOrThrow($reportId);

        if ($report['moderationStatus'] !== 'PENDING_REVIEW') {
            throw AppError::conflict('This report has already been ' . strtolower((string) $report['moderationStatus']) . '.');
        }

        $approve = $input['decision'] === 'APPROVE';
        $nextStatus = $approve ? 'APPROVED' : 'REJECTED';
        $now = Dates::now();

        Db::transaction(function () use ($reportId, $actor, $input, $approve, $nextStatus, $report, $now) {
            $sets = [
                '`moderationStatus` = ?',
                '`rejectionReason` = ?',
                '`moderatedById` = ?',
                '`moderatedAt` = ?',
                '`repairStatus` = ?',
                '`updatedAt` = ?',
            ];
            $params = [
                $nextStatus,
                $approve ? null : ($input['reason'] ?? null),
                $actor['id'],
                Dates::toDb($now),
                $approve ? 'NOT_ASSIGNED' : $report['repairStatus'],
                Dates::toDb($now),
            ];
            if (!empty($input['priority'])) {
                $sets[] = '`priority` = ?';
                $params[] = $input['priority'];
            }
            $params[] = $reportId;
            Db::execute('UPDATE `Report` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $params);

            Audit::history([
                'reportId' => $reportId,
                'type' => 'MODERATION',
                'fromValue' => $report['moderationStatus'],
                'toValue' => $nextStatus,
                'note' => $approve ? 'Report approved.' : 'Report rejected: ' . $input['reason'],
                'actorId' => $actor['id'],
                'actorRole' => $actor['role'],
            ]);
        });

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => $approve ? 'REPORT_APPROVED' : 'REPORT_REJECTED',
            'entityType' => 'Report',
            'entityId' => $reportId,
            'metadata' => ['reason' => $input['reason'] ?? null, 'referenceNo' => $report['referenceNo']],
        ], Audit::actorContext()));

        return Dto::report(self::getOrThrow($reportId));
    }

    // -----------------------------------------------------------------------
    //  Assignment (ADMIN only)
    // -----------------------------------------------------------------------

    public static function assign(string $reportId, array $actor, array $input): array
    {
        $report = self::getOrThrow($reportId);

        if ($report['moderationStatus'] !== 'APPROVED') {
            throw AppError::conflict('Only approved reports can be assigned to maintenance.');
        }

        $officer = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$input['officerId']]);
        if ($officer === null || $officer['role'] !== 'MAINTENANCE_OFFICER') {
            throw AppError::badRequest('Selected user is not a maintenance officer.');
        }
        if ($officer['status'] === 'SUSPENDED') {
            throw AppError::badRequest('Selected officer account is suspended.');
        }

        $previousOfficer = $report['assignedOfficerId'] ?? null;
        $now = Dates::now();

        Db::transaction(function () use ($reportId, $actor, $input, $officer, $previousOfficer, $now) {
            if ($previousOfficer && $previousOfficer !== $officer['id']) {
                Db::execute(
                    "UPDATE `Assignment` SET `status` = 'CANCELLED'
                     WHERE `reportId` = ? AND `officerId` = ? AND `status` IN ('ASSIGNED','IN_PROGRESS')",
                    [$reportId, $previousOfficer]
                );
            }

            Db::execute(
                'INSERT INTO `Assignment` (`id`,`reportId`,`officerId`,`assignedById`,`status`,`note`,`dueDate`,`createdAt`,`completedAt`)
                 VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    Ids::cuid(),
                    $reportId,
                    $officer['id'],
                    $actor['id'],
                    'ASSIGNED',
                    $input['note'] ?? null,
                    !empty($input['dueDate']) ? Dates::toDb($input['dueDate']) : null,
                    Dates::toDb($now),
                    null,
                ]
            );

            $sets = ['`assignedOfficerId` = ?', '`assignedAt` = ?', "`repairStatus` = 'AWAITING_MAINTENANCE'", '`updatedAt` = ?'];
            $params = [$officer['id'], Dates::toDb($now), Dates::toDb($now)];
            if (!empty($input['priority'])) {
                $sets[] = '`priority` = ?';
                $params[] = $input['priority'];
            }
            $params[] = $reportId;
            Db::execute('UPDATE `Report` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $params);

            Audit::history([
                'reportId' => $reportId,
                'type' => 'ASSIGNMENT',
                'fromValue' => $previousOfficer ?? 'UNASSIGNED',
                'toValue' => $officer['id'],
                'note' => !empty($input['note'])
                    ? 'Assigned to ' . $officer['fullName'] . ': ' . $input['note']
                    : 'Assigned to ' . $officer['fullName'] . '.',
                'actorId' => $actor['id'],
                'actorRole' => $actor['role'],
            ]);
        });

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => 'REPORT_ASSIGNED',
            'entityType' => 'Report',
            'entityId' => $reportId,
            'metadata' => ['officerId' => $officer['id'], 'officerName' => $officer['fullName']],
        ], Audit::actorContext()));

        return Dto::report(self::getOrThrow($reportId));
    }

    // -----------------------------------------------------------------------
    //  Maintenance (assigned officer, or admin)
    // -----------------------------------------------------------------------

    private static function actorMayMaintain(array $report, array $actor): bool
    {
        if (($actor['role'] ?? null) === 'ADMIN') {
            return true;
        }
        return ($report['assignedOfficerId'] ?? null) === $actor['id'];
    }

    public static function updateRepair(string $reportId, array $actor, array $input): array
    {
        $report = self::getOrThrow($reportId);

        if ($report['moderationStatus'] !== 'APPROVED') {
            throw AppError::conflict('Only approved reports can receive maintenance updates.');
        }
        if (!self::actorMayMaintain($report, $actor)) {
            throw AppError::forbidden('This report is not assigned to you.');
        }

        $targetStatus = $input['repairStatus'] ?? null;
        $wantsCompletion = $targetStatus === 'COMPLETED';

        $completionOverride = false;
        $completionNotes = $input['completionNotes'] ?? $report['completionNotes'];

        if ($wantsCompletion) {
            $afterPhotoCount = (int) Db::scalar('SELECT COUNT(*) FROM `ReportPhoto` WHERE `reportId` = ? AND `kind` = ?', [$reportId, 'AFTER']);
            $notesOk = is_string($completionNotes) && mb_strlen(trim($completionNotes)) >= 5;

            if (!$notesOk) {
                throw AppError::unprocessable('Completion notes are required to mark a repair as completed.');
            }
            if ($afterPhotoCount < 1) {
                if (($actor['role'] ?? null) !== 'ADMIN' || empty($input['overrideCompletion'])) {
                    throw AppError::unprocessable('At least one completion (after) photo is required. An administrator may override this requirement.');
                }
                $completionOverride = true;
            }
        }

        $now = Dates::now();

        Db::transaction(function () use ($reportId, $actor, $input, $targetStatus, $wantsCompletion, $completionNotes, $completionOverride, $report, $now) {
            $sets = ['`updatedAt` = ?'];
            $params = [Dates::toDb($now)];
            if ($targetStatus !== null) {
                $sets[] = '`repairStatus` = ?';
                $params[] = $targetStatus;
            }
            if (!empty($input['completionNotes'])) {
                $sets[] = '`completionNotes` = ?';
                $params[] = $completionNotes;
            }
            if ($wantsCompletion) {
                $sets[] = '`completedAt` = ?';
                $params[] = Dates::toDb($now);
                $sets[] = '`completionOverride` = ?';
                $params[] = $completionOverride ? 1 : 0;
            }
            $params[] = $reportId;
            Db::execute('UPDATE `Report` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $params);

            if ($targetStatus !== null) {
                Audit::history([
                    'reportId' => $reportId,
                    'type' => 'REPAIR',
                    'fromValue' => $report['repairStatus'],
                    'toValue' => $targetStatus,
                    'note' => $input['note'] ?? null,
                    'actorId' => $actor['id'],
                    'actorRole' => $actor['role'],
                ]);

                $assignmentStatus = $targetStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
                $assignmentParams = [$assignmentStatus];
                $assignmentSql = "UPDATE `Assignment` SET `status` = ?";
                if ($targetStatus === 'COMPLETED') {
                    $assignmentSql .= ', `completedAt` = ?';
                    $assignmentParams[] = Dates::toDb($now);
                }
                $assignmentSql .= " WHERE `reportId` = ? AND `status` IN ('ASSIGNED','IN_PROGRESS')";
                $assignmentParams[] = $reportId;
                if (!empty($report['assignedOfficerId'])) {
                    $assignmentSql .= ' AND `officerId` = ?';
                    $assignmentParams[] = $report['assignedOfficerId'];
                }
                Db::execute($assignmentSql, $assignmentParams);
            } elseif (!empty($input['note'])) {
                Audit::history([
                    'reportId' => $reportId,
                    'type' => 'REPAIR',
                    'toValue' => $report['repairStatus'],
                    'note' => $input['note'],
                    'actorId' => $actor['id'],
                    'actorRole' => $actor['role'],
                ]);
            }
        });

        Audit::record(array_merge([
            'actorId' => $actor['id'],
            'actorRole' => $actor['role'],
            'action' => $wantsCompletion ? 'REPAIR_COMPLETED' : 'REPAIR_UPDATED',
            'entityType' => 'Report',
            'entityId' => $reportId,
            'metadata' => ['to' => $targetStatus ?? $report['repairStatus'], 'override' => $completionOverride],
        ], Audit::actorContext()));

        return Dto::report(self::getOrThrow($reportId));
    }

    public static function officerSummary(string $officerId): array
    {
        $count = static fn (string $sql, array $params) => (int) Db::scalar($sql, $params);
        return [
            'assigned' => $count('SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ?', [$officerId]),
            'awaiting' => $count("SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ? AND `repairStatus` = 'AWAITING_MAINTENANCE'", [$officerId]),
            'inProgress' => $count("SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ? AND `repairStatus` = 'IN_PROGRESS'", [$officerId]),
            'completed' => $count("SELECT COUNT(*) FROM `Report` WHERE `assignedOfficerId` = ? AND `repairStatus` = 'COMPLETED'", [$officerId]),
        ];
    }

    // -----------------------------------------------------------------------
    //  Statistics
    // -----------------------------------------------------------------------

    public static function statistics(): array
    {
        $count = static fn (string $sql, array $params = []) => (int) Db::scalar($sql, $params);

        $totals = [
            'total' => $count('SELECT COUNT(*) FROM `Report`'),
            'pending' => $count("SELECT COUNT(*) FROM `Report` WHERE `moderationStatus` = 'PENDING_REVIEW'"),
            'approved' => $count("SELECT COUNT(*) FROM `Report` WHERE `moderationStatus` = 'APPROVED'"),
            'rejected' => $count("SELECT COUNT(*) FROM `Report` WHERE `moderationStatus` = 'REJECTED'"),
            'notAssigned' => $count("SELECT COUNT(*) FROM `Report` WHERE `repairStatus` = 'NOT_ASSIGNED'"),
            'awaiting' => $count("SELECT COUNT(*) FROM `Report` WHERE `repairStatus` = 'AWAITING_MAINTENANCE'"),
            'inProgress' => $count("SELECT COUNT(*) FROM `Report` WHERE `repairStatus` = 'IN_PROGRESS'"),
            'completed' => $count("SELECT COUNT(*) FROM `Report` WHERE `repairStatus` = 'COMPLETED'"),
        ];

        $byCategory = array_map(static fn ($r) => ['category' => $r['category'], 'count' => (int) $r['c']], Db::all('SELECT `category`, COUNT(*) AS `c` FROM `Report` GROUP BY `category`'));

        $byArea = array_map(static fn ($r) => ['area' => $r['area'] ?? 'Unknown', 'count' => (int) $r['c']], Db::all(
            'SELECT `areaLabel` AS `area`, COUNT(*) AS `c` FROM `Report` WHERE `areaLabel` IS NOT NULL GROUP BY `areaLabel` ORDER BY `c` DESC LIMIT 10'
        ));

        $recentRows = ReportQueries::hydrateMany(Db::all('SELECT * FROM `Report` ORDER BY `createdAt` DESC LIMIT 8'));
        $recent = array_map(static fn ($r) => Dto::report($r), $recentRows);

        return [
            'totals' => $totals,
            'byCategory' => $byCategory,
            'byArea' => $byArea,
            'recent' => $recent,
        ];
    }

    public static function listAuditLogs(int $limit = 100): array
    {
        $limit = max(1, min(500, $limit));
        $rows = Db::all(
            'SELECT a.*, u.`fullName` AS actor_fullName, u.`role` AS actor_role
             FROM `AuditLog` a
             LEFT JOIN `User` u ON u.`id` = a.`actorId`
             ORDER BY a.`createdAt` DESC
             LIMIT ' . $limit
        );
        return array_map(static fn ($r) => Dto::auditLog($r), $rows);
    }

    // -----------------------------------------------------------------------
    //  Upload helpers
    // -----------------------------------------------------------------------

    /**
     * Persist uploaded image files to storage before DB work.
     *
     * @param array<int,array{name:string,type:string,tmp_name:string,error:int,size:int}> $files
     * @return array<int,array{stored:array,width:?int,height:?int}>
     */
    public static function storeBuffers(array $files, string $folder): array
    {
        if (count($files) > 8) {
            throw AppError::badRequest('At most 8 photos may be uploaded at once.');
        }
        $out = [];
        foreach ($files as $file) {
            self::assertUploadOk($file);
            $buffer = @file_get_contents($file['tmp_name']);
            if ($buffer === false || $buffer === '') {
                continue;
            }
            $mime = self::resolveMime($file, $buffer);
            $dims = ImageMeta::dimensions($buffer);
            $stored = Storage::save($buffer, (string) $file['name'], $mime, $folder);
            $out[] = ['stored' => $stored, 'width' => $dims['width'], 'height' => $dims['height']];
        }
        return $out;
    }

    private static function persistPhotos(string $reportId, array $files, string $kind, ?string $uploadedById, string $folder = 'reports'): array
    {
        if (empty($files)) {
            return [];
        }
        $metas = self::storeBuffers($files, $folder);
        $created = [];
        $now = Dates::toDb(Dates::now());
        foreach ($metas as $m) {
            $id = Ids::cuid();
            Db::execute(
                'INSERT INTO `ReportPhoto` (`id`,`reportId`,`kind`,`storageKey`,`mimeType`,`sizeBytes`,`width`,`height`,`blurData`,`caption`,`uploadedById`,`createdAt`)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                    $id,
                    $reportId,
                    $kind,
                    $m['stored']['key'],
                    $m['stored']['mimeType'],
                    $m['stored']['sizeBytes'],
                    $m['width'],
                    $m['height'],
                    null,
                    null,
                    $uploadedById,
                    $now,
                ]
            );
            $created[] = $id;
        }
        return $created;
    }

    private static function assertUploadOk(array $file): void
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_OK);
        if ($error === UPLOAD_ERR_OK) {
            return;
        }
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            $mb = (int) round(\RoadWatch\Support\Config::maxUploadBytes() / (1024 * 1024));
            throw new AppError('File too large. Maximum size is ' . $mb . ' MB.', 413, 'UPLOAD_LIMIT_FILE_SIZE');
        }
        throw AppError::badRequest('One of the uploaded files failed to upload.');
    }

    private static function resolveMime(array $file, string $buffer): string
    {
        $client = strtolower(trim(explode(';', (string) ($file['type'] ?? ''))[0]));
        if (in_array($client, Schema::ACCEPTED_IMAGE_MIME, true)) {
            return $client;
        }
        $detected = null;
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = finfo_buffer($finfo, $buffer) ?: null;
                finfo_close($finfo);
            }
        }
        if ($detected !== null && in_array($detected, Schema::ACCEPTED_IMAGE_MIME, true)) {
            return $detected;
        }
        $shown = $client !== '' ? $client : ($detected ?? 'unknown');
        throw AppError::unsupportedMedia('Unsupported image type: ' . $shown . '. Allowed: JPEG, PNG, WebP, HEIC.');
    }
}
