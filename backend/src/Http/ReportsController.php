<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\ReportService;
use RoadWatch\Modules\Schema;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Request;
use RoadWatch\Support\Response;
use RoadWatch\Support\Validate;

class ReportsController
{
    /** Photos relevant to the requested kind, falling back to all uploaded files. */
    private static function filesForKind(string $kind): array
    {
        $map = ['BEFORE' => 'photos', 'PROGRESS' => 'progressPhotos', 'AFTER' => 'afterPhotos'];
        $field = $map[$kind] ?? 'photos';
        $picked = Request::files($field);
        return $picked ?: Request::allPhotoFiles();
    }

    public static function create(): array
    {
        $actor = Auth::authenticate();
        $body = Request::body();

        $title = Validate::string($body['title'] ?? null, 'title', true, 4, 160, 'Title must be at least 4 characters');
        $description = Validate::string($body['description'] ?? null, 'description', true, 10, 4000, 'Please describe the issue (min 10 characters)');
        $category = Validate::enum($body['category'] ?? null, 'category', Schema::CATEGORIES);
        // "Other" is only meaningful with an explanation, so the free text is
        // required for that category and discarded (forced to null) for every
        // other one — the two clients apply the identical rule.
        $categoryOther = Validate::string(
            $body['categoryOther'] ?? null,
            'categoryOther',
            false,
            0,
            Schema::CATEGORY_OTHER_MAX
        );
        if ($category === Schema::CATEGORY_OTHER) {
            if ($categoryOther === null || mb_strlen($categoryOther) < Schema::CATEGORY_OTHER_MIN) {
                Validate::fail(
                    'categoryOther',
                    'Please describe the issue when the category is Other (min ' . Schema::CATEGORY_OTHER_MIN . ' characters).'
                );
            }
        } else {
            $categoryOther = null;
        }
        $latitude = Validate::number($body['latitude'] ?? null, 'latitude', -90, 90);
        $longitude = Validate::number($body['longitude'] ?? null, 'longitude', -180, 180);
        $addressText = Validate::string($body['addressText'] ?? null, 'addressText', false, 0, 500);
        $areaLabel = Validate::string($body['areaLabel'] ?? null, 'areaLabel', false, 0, 160);
        $destination = Validate::string($body['destination'] ?? null, 'destination', false, 0, Schema::DESTINATION_MAX);
        $damageCause = Validate::string($body['damageCause'] ?? null, 'damageCause', false, 0, Schema::DAMAGE_CAUSE_MAX);
        $relatedCategories = $body['relatedCategories'] ?? [];
        if (is_string($relatedCategories)) {
            $decoded = json_decode($relatedCategories, true);
            if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
                Validate::fail('relatedCategories', 'Additional issue types must be a JSON array.');
            }
            $relatedCategories = $decoded;
        }
        if (!is_array($relatedCategories) || count($relatedCategories) > count(Schema::RELATED_CATEGORIES)) {
            Validate::fail('relatedCategories', 'Select valid additional issue types.');
        }
        foreach ($relatedCategories as $relatedCategory) {
            if (!is_string($relatedCategory)
                || !in_array($relatedCategory, Schema::RELATED_CATEGORIES, true)
                || $relatedCategory === $category) {
                Validate::fail('relatedCategories', 'Additional issue types must be valid and different from the main issue type.');
            }
        }
        $relatedCategories = array_values(array_unique($relatedCategories));
        $hasFlooding = $category === 'FLOODING' || in_array('FLOODING', $relatedCategories, true);
        $surfaceCondition = Validate::enum(
            $body['surfaceCondition'] ?? null,
            'surfaceCondition',
            Schema::SURFACE_CONDITIONS,
            false
        );
        if ($hasFlooding) {
            $surfaceCondition = $surfaceCondition ?? 'UNKNOWN';
        } else {
            $surfaceCondition = null;
        }
        $priority = Validate::enum($body['priority'] ?? null, 'priority', Schema::PRIORITIES, false);

        $report = ReportService::create($actor, [
            'title' => $title,
            'description' => $description,
            'category' => $category,
            'categoryOther' => $categoryOther,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'addressText' => $addressText,
            'areaLabel' => $areaLabel,
            'destination' => $destination,
            'damageCause' => $damageCause,
            'relatedCategories' => $relatedCategories,
            'surfaceCondition' => $surfaceCondition,
            'priority' => $priority,
        ], Request::allPhotoFiles());

        Response::status(201);
        return ['report' => $report];
    }

    public static function mine(): array
    {
        $actor = Auth::authenticate();
        return ReportService::listForCitizen($actor['id'], ReportService::parseListQuery());
    }

    public static function index(): array
    {
        Auth::requireStaff();
        return ReportService::listForStaff(ReportService::parseListQuery());
    }

    public static function stats(): array
    {
        Auth::requireAdmin();
        return ReportService::statistics();
    }

    public static function show(array $params): array
    {
        $actor = Auth::optionalAuthenticate();
        return ['report' => ReportService::getForViewer($params['id'], $actor)];
    }

    public static function history(array $params): array
    {
        $actor = Auth::optionalAuthenticate();
        return ['history' => ReportService::getHistory($params['id'], $actor)];
    }

    public static function addPhotos(array $params): array
    {
        $actor = Auth::authenticate();
        $kind = Validate::enum(Request::body('kind') ?? 'BEFORE', 'kind', Schema::PHOTO_KINDS, false) ?? 'BEFORE';
        $report = ReportService::addPhotos($params['id'], $actor, self::filesForKind($kind), $kind);
        Response::status(201);
        return ['report' => $report];
    }

    public static function destroy(array $params): array
    {
        $actor = Auth::authenticate();
        return ReportService::delete($params['id'], $actor);
    }

    public static function destroyAsAdmin(array $params): array
    {
        $actor = Auth::requireAdmin();
        return ReportService::deleteAsAdmin($params['id'], $actor);
    }

    public static function moderation(array $params): array
    {
        $actor = Auth::requireAdmin();
        $body = Request::body();
        $decision = Validate::enum($body['decision'] ?? null, 'decision', ['APPROVE', 'REJECT']);
        $reason = Validate::string($body['reason'] ?? null, 'reason', false, 0, 1000);
        $priority = Validate::enum($body['priority'] ?? null, 'priority', Schema::PRIORITIES, false);
        if ($decision === 'REJECT' && ($reason === null || mb_strlen($reason) < 5)) {
            Validate::fail('reason', 'A rejection reason (min 5 characters) is required.');
        }

        return ['report' => ReportService::moderate($params['id'], $actor, [
            'decision' => $decision,
            'reason' => $reason,
            'priority' => $priority,
        ])];
    }

    public static function assign(array $params): array
    {
        $actor = Auth::requireAdmin();
        $body = Request::body();
        $officerId = Validate::string($body['officerId'] ?? null, 'officerId', true, 1, PHP_INT_MAX, null, null, 'Select a maintenance officer');
        $priority = Validate::enum($body['priority'] ?? null, 'priority', Schema::PRIORITIES, false);
        $note = Validate::string($body['note'] ?? null, 'note', false, 0, 1000);
        $dueDate = Validate::date($body['dueDate'] ?? null, 'dueDate', false);

        return ['report' => ReportService::assign($params['id'], $actor, [
            'officerId' => $officerId,
            'priority' => $priority,
            'note' => $note,
            'dueDate' => $dueDate,
        ])];
    }

    public static function repair(array $params): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        $body = Request::body();
        $repairStatus = Validate::enum($body['repairStatus'] ?? null, 'repairStatus', Schema::REPAIR_UPDATABLE, false);
        $note = Validate::string($body['note'] ?? null, 'note', false, 0, 2000);
        $completionNotes = Validate::string($body['completionNotes'] ?? null, 'completionNotes', false, 0, 4000);

        return ['report' => ReportService::updateRepair($params['id'], $actor, [
            'repairStatus' => $repairStatus,
            'note' => $note,
            'completionNotes' => $completionNotes,
        ])];
    }

    public static function repairEvidence(array $params): array
    {
        $actor = Auth::requireRole('MAINTENANCE_OFFICER');
        $body = Request::body();
        $completionNotes = Validate::string(
            $body['completionNotes'] ?? null,
            'completionNotes',
            true,
            5,
            4000,
            'Completion notes of at least 5 characters are required.'
        );
        $files = self::filesForKind('AFTER');
        if (empty($files)) {
            Validate::fail('afterPhotos', 'At least one after-repair photo is required.');
        }

        return ['report' => ReportService::submitRepairEvidence(
            $params['id'],
            $actor,
            $completionNotes,
            $files
        )];
    }

    public static function verification(array $params): array
    {
        $actor = Auth::requireAdmin();
        $body = Request::body();
        $decision = Validate::enum($body['decision'] ?? null, 'decision', ['VERIFY', 'RETURN']);
        $reason = Validate::string($body['reason'] ?? null, 'reason', false, 0, 1000);
        if ($decision === 'RETURN' && ($reason === null || mb_strlen(trim($reason)) < 5)) {
            Validate::fail('reason', 'A return reason of at least 5 characters is required.');
        }
        return ['report' => ReportService::verifyRepair($params['id'], $actor, [
            'decision' => $decision,
            'reason' => $reason,
        ])];
    }
}
