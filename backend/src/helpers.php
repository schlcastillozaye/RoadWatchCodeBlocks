<?php

use RoadWatch\Support\Env;

if (!function_exists('env')) {
    /** Read an environment variable with an optional default. */
    function env(string $key, $default = null)
    {
        return Env::get($key, $default);
    }
}

if (!function_exists('base_path')) {
    /** Absolute path inside the backend directory. */
    function base_path(string $path = ''): string
    {
        $root = defined('RW_ROOT') ? RW_ROOT : dirname(__DIR__);
        return $path === '' ? $root : $root . '/' . ltrim($path, '/');
    }
}

if (!function_exists('rw_log')) {
    /** Minimal structured logger writing to stderr. */
    function rw_log(string $level, string $message, $meta = null): void
    {
        $threshold = \RoadWatch\Support\Config::isProd() ? 'info' : 'debug';
        $order = ['debug' => 10, 'info' => 20, 'warn' => 30, 'error' => 40];
        $level = strtolower($level);
        if (($order[$level] ?? 40) < ($order[$threshold] ?? 10)) {
            return;
        }
        $line = '[' . gmdate('Y-m-d\TH:i:s\Z') . '] ' . strtoupper($level) . ' ' . $message;
        if ($meta !== null) {
            $line .= ' ' . (is_string($meta) ? $meta : json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }
        file_put_contents('php://stderr', $line . PHP_EOL);
    }
}
