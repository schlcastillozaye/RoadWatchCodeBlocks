<?php

namespace RoadWatch\Modules;

use RoadWatch\Support\Config;
use RoadWatch\Support\Dates;

/**
 * Serialises database rows into the exact JSON shapes the API contract
 * promises (shared by the mobile app and the web platform).
 */
class Dto
{
    /** Build the URL clients use to fetch a stored photo. */
    public static function photoUrl(?string $storageKey): ?string
    {
        if ($storageKey === null || $storageKey === '') {
            return null;
        }
        $base = rtrim(Config::publicBaseUrl(), '/');
        $encoded = implode('/', array_map('rawurlencode', explode('/', $storageKey)));
        return $base . '/api/files/by-key/' . $encoded;
    }

    public static function photo(array $photo, string $moderationStatus): array
    {
        return [
            'id' => $photo['id'],
            'kind' => $photo['kind'],
            'url' => self::photoUrl($photo['storageKey']),
            'mimeType' => $photo['mimeType'],
            'sizeBytes' => (int) $photo['sizeBytes'],
            'width' => isset($photo['width']) ? (int) $photo['width'] : null,
            'height' => isset($photo['height']) ? (int) $photo['height'] : null,
            'caption' => $photo['caption'] ?? null,
            'isPublic' => $moderationStatus === 'APPROVED',
            'createdAt' => Dates::iso($photo['createdAt']),
        ];
    }

    /**
     * @param array<string,mixed> $report Hydrated report (with photos + relations).
     */
    public static function report(array $report, bool $publicView = false): array
    {
        $moderation = (string) $report['moderationStatus'];
        $photos = [];
        foreach ($report['photos'] ?? [] as $photo) {
            $photos[] = self::photo($photo, $moderation);
        }

        $base = [
            'id' => $report['id'],
            'referenceNo' => $report['referenceNo'],
            'title' => $report['title'],
            'description' => $report['description'],
            'category' => $report['category'],
            // Free-text explanation supplied when category is OTHER. Null for
            // every other category, and for rows created before the column
            // existed (`?? null` keeps pre-migration databases working).
            'categoryOther' => $report['categoryOther'] ?? null,
            'priority' => $report['priority'],
            'latitude' => (float) $report['latitude'],
            'longitude' => (float) $report['longitude'],
            'addressText' => $report['addressText'] ?? null,
            'areaLabel' => $report['areaLabel'] ?? null,
            'destination' => $report['destination'] ?? null,
            'damageCause' => $report['damageCause'] ?? null,
            'relatedCategories' => self::relatedCategories($report['relatedCategories'] ?? null),
            'surfaceCondition' => $report['surfaceCondition'] ?? null,
            'moderationStatus' => $moderation,
            'repairStatus' => $report['repairStatus'],
            'photos' => $photos,
            'createdAt' => Dates::iso($report['createdAt']),
            'updatedAt' => Dates::iso($report['updatedAt']),
        ];

        if ($publicView) {
            return $base;
        }

        return array_merge($base, [
            'rejectionReason' => $report['rejectionReason'] ?? null,
            'moderatedAt' => Dates::iso($report['moderatedAt'] ?? null),
            'moderatedBy' => self::userRef($report['moderatedBy'] ?? null),
            'assignedAt' => Dates::iso($report['assignedAt'] ?? null),
            'completedAt' => Dates::iso($report['completedAt'] ?? null),
            'completionNotes' => $report['completionNotes'] ?? null,
            'completionOverride' => (bool) ($report['completionOverride'] ?? false),
            'citizen' => self::userRef($report['citizen'] ?? null),
            'assignedOfficer' => self::userRef($report['assignedOfficer'] ?? null),
        ]);
    }

    public static function publicSummary(array $report): array
    {
        $thumbnail = null;
        foreach ($report['photos'] ?? [] as $photo) {
            if (($photo['kind'] ?? '') === 'BEFORE') {
                $thumbnail = self::photoUrl($photo['storageKey']);
                break;
            }
        }
        return [
            'id' => $report['id'],
            'referenceNo' => $report['referenceNo'],
            'title' => $report['title'],
            'category' => $report['category'],
            'categoryOther' => $report['categoryOther'] ?? null,
            'priority' => $report['priority'],
            'latitude' => (float) $report['latitude'],
            'longitude' => (float) $report['longitude'],
            'addressText' => $report['addressText'] ?? null,
            'areaLabel' => $report['areaLabel'] ?? null,
            'destination' => $report['destination'] ?? null,
            'damageCause' => $report['damageCause'] ?? null,
            'relatedCategories' => self::relatedCategories($report['relatedCategories'] ?? null),
            'surfaceCondition' => $report['surfaceCondition'] ?? null,
            'repairStatus' => $report['repairStatus'],
            'moderationStatus' => $report['moderationStatus'],
            'createdAt' => Dates::iso($report['createdAt']),
            'updatedAt' => Dates::iso($report['updatedAt']),
            'thumbnailUrl' => $thumbnail,
        ];
    }

    public static function user(array $user): array
    {
        return [
            'id' => $user['id'],
            'fullName' => $user['fullName'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? null,
            'role' => $user['role'],
            'status' => $user['status'],
            'avatarUrl' => !empty($user['avatarKey']) ? self::photoUrl($user['avatarKey']) : null,
            'createdAt' => Dates::iso($user['createdAt']),
        ];
    }

    public static function history(array $row): array
    {
        return [
            'id' => $row['id'],
            'type' => $row['type'],
            'fromValue' => $row['fromValue'] ?? null,
            'toValue' => $row['toValue'],
            'note' => $row['note'] ?? null,
            'actorRole' => $row['actorRole'] ?? null,
            'actor' => self::userRef($row['actor'] ?? null),
            'createdAt' => Dates::iso($row['createdAt']),
        ];
    }

    public static function auditLog(array $row): array
    {
        $metadata = null;
        if (!empty($row['metadata'])) {
            $decoded = json_decode((string) $row['metadata'], true);
            $metadata = json_last_error() === JSON_ERROR_NONE ? $decoded : $row['metadata'];
        }
        $actor = null;
        if (!empty($row['actorId'])) {
            $actor = [
                'id' => $row['actorId'],
                'fullName' => $row['actor_fullName'] ?? null,
                'role' => $row['actor_role'] ?? null,
            ];
        }
        return [
            'id' => $row['id'],
            'action' => $row['action'],
            'entityType' => $row['entityType'],
            'entityId' => $row['entityId'] ?? null,
            'metadata' => $metadata,
            'ipAddress' => $row['ipAddress'] ?? null,
            'createdAt' => Dates::iso($row['createdAt']),
            'actor' => $actor,
        ];
    }

    /** @param array<string,mixed>|null $user */
    private static function userRef(?array $user): ?array
    {
        if ($user === null || !isset($user['id'])) {
            return null;
        }
        return ['id' => $user['id'], 'fullName' => $user['fullName'] ?? null];
    }

    /** Return an empty list for old rows or malformed legacy data. */
    private static function relatedCategories($value): array
    {
        if (is_array($value)) {
            return array_values(array_filter($value, 'is_string'));
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
    }
}
