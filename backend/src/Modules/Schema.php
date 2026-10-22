<?php

namespace RoadWatch\Modules;

/** Canonical enum values shared by validation and business logic. */
class Schema
{
    /**
     * Canonical issue categories — the value list the API validates against.
     *
     * This is a *superset* of what the clients offer for new submissions:
     * `DAMAGED_DRAINAGE` predates the current picker and is kept so reports
     * created before it was retired keep validating, filtering and rendering.
     * Adding a value here is additive and must be mirrored in the `Report`
     * enum (see `database/migrate.php`) and in both clients.
     */
    public const CATEGORIES = ['POTHOLE', 'DAMAGED_PAVEMENT', 'ROAD_CRACK', 'FLOODING', 'DAMAGED_DRAINAGE', 'ROAD_OBSTRUCTION', 'OTHER'];

    /** Category that requires the free-text `categoryOther` explanation. */
    public const CATEGORY_OTHER = 'OTHER';

    /** Length bounds for `categoryOther` — mirrored by the web and mobile forms. */
    public const CATEGORY_OTHER_MIN = 5;
    public const CATEGORY_OTHER_MAX = 300;
    public const DAMAGE_CAUSE_MAX = 500;
    public const DESTINATION_MAX = 300;
    public const SURFACE_CONDITIONS = ['UNKNOWN', 'VISIBLE_DAMAGE', 'NO_VISIBLE_DAMAGE'];
    public const RELATED_CATEGORIES = ['POTHOLE', 'DAMAGED_PAVEMENT', 'ROAD_CRACK', 'FLOODING', 'DAMAGED_DRAINAGE', 'ROAD_OBSTRUCTION'];
    public const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    public const MODERATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];
    public const REPAIR_STATUSES = ['NOT_ASSIGNED', 'AWAITING_MAINTENANCE', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'RETURNED_FOR_WORK', 'COMPLETED', 'VERIFIED_COMPLETED'];
    public const REPAIR_UPDATABLE = ['AWAITING_MAINTENANCE', 'IN_PROGRESS', 'AWAITING_VERIFICATION'];
    public const PHOTO_KINDS = ['BEFORE', 'PROGRESS', 'AFTER'];
    public const ROLES = ['CITIZEN', 'MAINTENANCE_OFFICER', 'ADMIN'];
    public const USER_STATUSES = ['ACTIVE', 'SUSPENDED'];

    public const ACCEPTED_IMAGE_MIME = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
    ];
}
