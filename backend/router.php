<?php

/**
 * Router script for PHP's built-in development server.
 *
 *   php -S 127.0.0.1:4000 -t public router.php
 *
 * Serves real static files directly and forwards everything else to the
 * front controller.
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$file = __DIR__ . '/public' . $uri;

if ($uri !== '/' && is_file($file)) {
    return false; // let the built-in server serve the file
}

require __DIR__ . '/public/index.php';
