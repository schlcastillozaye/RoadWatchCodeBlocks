<?php

namespace RoadWatch\Support;

/**
 * Minimal pattern router. Patterns use `{name}` for a single path segment and
 * `{name:path}` to capture the remainder of the path (used by the file route).
 */
class Router
{
    /** @var array<int,array{method:string,pattern:string,handler:callable}> */
    private static array $routes = [];

    public static function add(string $method, string $pattern, callable $handler): void
    {
        self::$routes[] = ['method' => strtoupper($method), 'pattern' => $pattern, 'handler' => $handler];
    }

    public static function get(string $pattern, callable $handler): void
    {
        self::add('GET', $pattern, $handler);
    }

    public static function post(string $pattern, callable $handler): void
    {
        self::add('POST', $pattern, $handler);
    }

    public static function patch(string $pattern, callable $handler): void
    {
        self::add('PATCH', $pattern, $handler);
    }

    public static function delete(string $pattern, callable $handler): void
    {
        self::add('DELETE', $pattern, $handler);
    }

    public static function dispatch(string $method, string $path)
    {
        foreach (self::$routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            $params = self::match($route['pattern'], $path);
            if ($params !== null) {
                return call_user_func($route['handler'], $params);
            }
        }
        throw AppError::notFound("Route not found: {$method} {$path}");
    }

    /** @return array<string,string>|null */
    private static function match(string $pattern, string $path): ?array
    {
        $p = explode('/', trim($pattern, '/'));
        $s = explode('/', trim($path, '/'));
        $params = [];

        foreach ($p as $i => $segment) {
            if ($segment !== '' && $segment[0] === '{') {
                $inner = trim($segment, '{}');
                $name = $inner;
                $isPath = false;
                if (strpos($inner, ':') !== false) {
                    [$name, $type] = explode(':', $inner, 2);
                    $isPath = $type === 'path';
                }
                if ($isPath) {
                    if (!isset($s[$i])) {
                        return null;
                    }
                    $rest = implode('/', array_slice($s, $i));
                    if ($rest === '') {
                        return null;
                    }
                    $params[$name] = $rest;
                    return $params;
                }
                if (!isset($s[$i])) {
                    return null;
                }
                $params[$name] = $s[$i];
                continue;
            }

            if (!isset($s[$i]) || $s[$i] !== $segment) {
                return null;
            }
        }

        if (count($s) !== count($p)) {
            return null;
        }
        return $params;
    }
}
