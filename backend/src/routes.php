<?php

use RoadWatch\Http\AnalyticsController;
use RoadWatch\Http\AuthController;
use RoadWatch\Http\FilesController;
use RoadWatch\Http\HealthController;
use RoadWatch\Http\MaintenanceController;
use RoadWatch\Http\MapController;
use RoadWatch\Http\NotificationsController;
use RoadWatch\Http\ReportsController;
use RoadWatch\Http\UsersController;
use RoadWatch\Support\Router;

// -- Health ------------------------------------------------------------------
Router::get('/', [HealthController::class, 'root']);
Router::get('/health', [HealthController::class, 'health']);

// -- Auth --------------------------------------------------------------------
Router::post('/api/auth/register', [AuthController::class, 'register']);
Router::post('/api/auth/login', [AuthController::class, 'login']);
Router::post('/api/auth/refresh', [AuthController::class, 'refresh']);
Router::post('/api/auth/logout', [AuthController::class, 'logout']);
Router::get('/api/auth/me', [AuthController::class, 'me']);

// -- Reports -----------------------------------------------------------------
Router::post('/api/reports', [ReportsController::class, 'create']);
Router::get('/api/reports/mine', [ReportsController::class, 'mine']);
Router::get('/api/reports/stats', [ReportsController::class, 'stats']);
Router::get('/api/reports', [ReportsController::class, 'index']);
Router::get('/api/reports/{id}/history', [ReportsController::class, 'history']);
Router::post('/api/reports/{id}/photos', [ReportsController::class, 'addPhotos']);
Router::patch('/api/reports/{id}/moderation', [ReportsController::class, 'moderation']);
Router::post('/api/reports/{id}/assign', [ReportsController::class, 'assign']);
Router::patch('/api/reports/{id}/repair', [ReportsController::class, 'repair']);
Router::delete('/api/admin/reports/{id}', [ReportsController::class, 'destroyAsAdmin']);
Router::delete('/api/reports/{id}', [ReportsController::class, 'destroy']);
Router::get('/api/reports/{id}', [ReportsController::class, 'show']);

// -- Maintenance -------------------------------------------------------------
Router::get('/api/maintenance/assignments', [MaintenanceController::class, 'assignments']);
Router::get('/api/maintenance/summary', [MaintenanceController::class, 'summary']);
Router::get('/api/maintenance/notifications', [NotificationsController::class, 'index']);
Router::patch('/api/maintenance/notifications/read-all', [NotificationsController::class, 'markAllRead']);
Router::patch('/api/maintenance/notifications/{id}/read', [NotificationsController::class, 'markRead']);

// -- Public map --------------------------------------------------------------
Router::get('/api/map/reports', [MapController::class, 'reports']);
Router::get('/api/map/reports/{id}', [MapController::class, 'report']);
Router::get('/api/map/geocode/reverse', [MapController::class, 'reverseGeocode']);
Router::get('/api/map/geocode/search', [MapController::class, 'searchPlaces']);

// -- Files -------------------------------------------------------------------
Router::get('/api/files/by-key/{key:path}', [FilesController::class, 'byKey']);

// -- Users -------------------------------------------------------------------
Router::get('/api/users/me', [UsersController::class, 'me']);
Router::patch('/api/users/me', [UsersController::class, 'updateMe']);
Router::post('/api/users/me/password', [UsersController::class, 'changePassword']);
Router::get('/api/users/officers', [UsersController::class, 'officers']);
Router::get('/api/users', [UsersController::class, 'index']);
Router::post('/api/users', [UsersController::class, 'create']);
Router::patch('/api/users/{id}', [UsersController::class, 'update']);
Router::post('/api/users/{id}/reset-password', [UsersController::class, 'resetPassword']);

// -- Analytics ---------------------------------------------------------------
Router::get('/api/analytics/summary', [AnalyticsController::class, 'summary']);
Router::get('/api/analytics/audit-logs', [AnalyticsController::class, 'auditLogs']);
