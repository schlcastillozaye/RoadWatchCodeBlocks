<?php

namespace RoadWatch\Modules;

/** Canonical enum values shared by validation and business logic. */
class Schema
{
    public const CATEGORIES = ['POTHOLE', 'DAMAGED_PAVEMENT', 'ROAD_CRACK', 'FLOODING', 'DAMAGED_DRAINAGE', 'OTHER'];
    public const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    public const MODERATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];
    public const REPAIR_STATUSES = ['NOT_ASSIGNED', 'AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED'];
    public const REPAIR_UPDATABLE = ['AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED'];
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
