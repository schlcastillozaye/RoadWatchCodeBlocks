<?php

/**
 * RoadWatch API — front controller.
 *
 * All requests (except real static files) are routed here. Run with:
 *   php -S 127.0.0.1:4000 -t public router.php
 * or point an Apache/Nginx document root at the public/ directory.
 */

require __DIR__ . '/../src/bootstrap.php';

use RoadWatch\Support\Cors;
use RoadWatch\Support\ErrorHandler;
use RoadWatch\Support\RateLimit;
use RoadWatch\Support\Request;
use RoadWatch\Support\Response;
use RoadWatch\Support\Router;

Cors::apply();

$method = Request::method();
$path = Request::path();

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // Baseline API limit for everything under /api (matches the Node app).
    if (strpos($path, '/api') === 0) {
        RateLimit::hit('general', 600, 60, 'Too many requests. Please slow down.');

        // Stricter credential-stuffing limit on the three auth write routes only.
        if ($method === 'POST' && in_array($path, ['/api/auth/register', '/api/auth/login', '/api/auth/refresh'], true)) {
            RateLimit::hit('auth', 30, 15 * 60, 'Too many attempts. Please try again later.');
        }
    }

    require __DIR__ . '/../src/routes.php';

    $result = Router::dispatch($method, $path);
    Response::send($result);
} catch (\Throwable $e) {
    ErrorHandler::handle($e, $method, $path);
}
