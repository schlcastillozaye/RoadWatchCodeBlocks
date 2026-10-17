<?php

namespace RoadWatch\Support;

/** CORS handling matching the original Express configuration. */
class Cors
{
    public static function apply(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = Config::corsOrigins();
        $allowAll = in_array('*', $allowed, true);

        if ($origin === '' || $allowAll || in_array($origin, $allowed, true)) {
            if ($origin !== '') {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
            }
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Requested-With');
        header('Access-Control-Max-Age: 86400');
    }
}
