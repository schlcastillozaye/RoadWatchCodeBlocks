<?php

namespace RoadWatch\Http;

use RoadWatch\Services\Storage;
use RoadWatch\Support\AppError;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Db;
use RoadWatch\Support\Response;

class FilesController
{
    /**
     * Authorisation-gated file delivery.
     *
     *  - Photos attached to APPROVED reports are public (they appear on the map).
     *  - Any other photo requires a Bearer token and is limited to the owning
     *    citizen or staff.
     */
    public static function byKey(array $params): ?array
    {
        $raw = (string) ($params['key'] ?? '');
        $key = ltrim(rawurldecode($raw), '/');
        if ($key === '') {
            throw AppError::badRequest('Missing file key');
        }

        $photo = Db::one(
            'SELECT p.`storageKey`, p.`mimeType`, r.`moderationStatus`, r.`citizenId`
             FROM `ReportPhoto` p
             INNER JOIN `Report` r ON r.`id` = p.`reportId`
             WHERE p.`storageKey` = ?
             LIMIT 1',
            [$key]
        );
        if ($photo === null) {
            throw AppError::notFound('File not found');
        }

        $isPublic = $photo['moderationStatus'] === 'APPROVED';
        $auth = Auth::optionalAuthenticate();
        $isOwner = $auth !== null && $auth['id'] === $photo['citizenId'];
        $isStaff = $auth !== null && in_array($auth['role'], ['ADMIN', 'MAINTENANCE_OFFICER'], true);

        if (!$isPublic && !$isOwner && !$isStaff) {
            throw AppError::unauthenticated('You are not allowed to view this file.');
        }

        $buffer = Storage::read($key);

        Response::stream($buffer, [
            'Content-Type' => $photo['mimeType'],
            'Content-Length' => (string) strlen($buffer),
            'Cache-Control' => $isPublic ? 'public, max-age=86400' : 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);

        return null;
    }
}
