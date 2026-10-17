<?php

/**
 * RoadWatch backend bootstrap.
 *
 * Sets up the PSR-4 style autoloader (no Composer required) and loads the
 * environment file. Included by every entry point (public/index.php, seed.php).
 */

define('RW_ROOT', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    $prefix = 'RoadWatch\\';
    $len = strlen($prefix);
    if (strncmp($class, $prefix, $len) !== 0) {
        return;
    }
    $relative = substr($class, $len);
    $file = RW_ROOT . '/src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require RW_ROOT . '/src/helpers.php';

\RoadWatch\Support\Env::load(RW_ROOT . '/.env');
