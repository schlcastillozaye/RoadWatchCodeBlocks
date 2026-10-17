<?php

namespace RoadWatch\Support;

/**
 * Tiny .env loader + typed accessors. Mimics the semantics of the original
 * Node `config/env.ts` helpers (str/num/bool).
 */
class Env
{
    /** @var array<string,string> */
    private static array $vars = [];
    private static bool $loaded = false;

    public static function load(string $path): void
    {
        self::$loaded = true;
        if (!is_file($path)) {
            return;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            $value = trim(substr($line, $pos + 1));
            if ($key === '') {
                continue;
            }
            // Strip surrounding quotes.
            $len = strlen($value);
            if ($len >= 2) {
                $first = $value[0];
                $last = $value[$len - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            // A real environment variable always wins over the file.
            if (getenv($key) !== false) {
                self::$vars[$key] = (string) getenv($key);
                continue;
            }
            self::$vars[$key] = $value;
            putenv($key . '=' . $value);
        }
    }

    public static function get(string $key, $default = null)
    {
        if (array_key_exists($key, self::$vars)) {
            return self::$vars[$key];
        }
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return $value;
    }

    public static function str(string $key, ?string $default = null): string
    {
        $value = self::get($key);
        if ($value === null) {
            if ($default === null) {
                throw new \RuntimeException("Missing required environment variable: {$key}");
            }
            return $default;
        }
        return (string) $value;
    }

    public static function num(string $key, $default)
    {
        $value = self::get($key);
        if ($value === null || $value === '') {
            return $default;
        }
        return is_numeric($value) ? $value + 0 : $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key);
        if ($value === null) {
            return $default;
        }
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
    }
}
