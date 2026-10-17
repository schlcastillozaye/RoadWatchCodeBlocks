<?php

namespace RoadWatch\Support;

/**
 * Read-only access to the current HTTP request (method, path, query, body,
 * uploaded files and headers).
 */
class Request
{
    /** Populated by the auth middleware. @var array{id:string,role:string,email:string,fullName:string}|null */
    public static ?array $auth = null;

    private static ?array $jsonBody = null;
    private static bool $jsonParsed = false;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH);
        if ($path === false || $path === null || $path === '') {
            $path = '/';
        }
        return '/' . trim($path, '/');
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (isset($_SERVER[$key])) {
            return (string) $_SERVER[$key];
        }
        $special = [
            'content-type' => 'CONTENT_TYPE',
            'content-length' => 'CONTENT_LENGTH',
            'authorization' => 'HTTP_AUTHORIZATION',
        ];
        $lower = strtolower($name);
        if (isset($special[$lower], $_SERVER[$special[$lower]])) {
            return (string) $_SERVER[$special[$lower]];
        }
        return null;
    }

    public static function bearerToken(): ?string
    {
        $header = self::header('authorization');
        if ($header === null) {
            return null;
        }
        $parts = preg_split('/\s+/', trim($header));
        if (count($parts) !== 2 || strtolower($parts[0]) !== 'bearer' || $parts[1] === '') {
            return null;
        }
        return $parts[1];
    }

    public static function query(?string $key = null, $default = null)
    {
        if ($key === null) {
            return $_GET;
        }
        return array_key_exists($key, $_GET) ? $_GET[$key] : $default;
    }

    /** Decoded JSON body (or an empty array). */
    public static function json(): array
    {
        if (self::$jsonParsed) {
            return self::$jsonBody ?? [];
        }
        self::$jsonParsed = true;
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            self::$jsonBody = [];
            return [];
        }
        $decoded = json_decode($raw, true);
        self::$jsonBody = is_array($decoded) ? $decoded : [];
        return self::$jsonBody;
    }

    /** Body value: multipart/form fields first, then JSON. */
    public static function body(?string $key = null, $default = null)
    {
        $merged = $_POST;
        if (empty($merged)) {
            $merged = self::json();
        } else {
            $merged = array_merge(self::json(), $merged);
        }
        if ($key === null) {
            return $merged;
        }
        return array_key_exists($key, $merged) ? $merged[$key] : $default;
    }

    public static function rawBody(): string
    {
        $raw = file_get_contents('php://input');
        return $raw === false ? '' : $raw;
    }

    public static function ip(): ?string
    {
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($forwarded !== '') {
            $first = trim(explode(',', $forwarded)[0]);
            if ($first !== '') {
                return $first;
            }
        }
        return $_SERVER['REMOTE_ADDR'] ?? null;
    }

    public static function userAgent(): ?string
    {
        return self::header('user-agent');
    }

    /**
     * Normalise PHP's $_FILES structure for a field into a flat list.
     *
     * @return array<int,array{name:string,type:string,tmp_name:string,error:int,size:int}>
     */
    public static function files(string $field): array
    {
        if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) {
            return [];
        }
        $f = $_FILES[$field];
        $out = [];

        if (isset($f['name']) && is_array($f['name'])) {
            $count = count($f['name']);
            for ($i = 0; $i < $count; $i++) {
                $error = $f['error'][$i] ?? UPLOAD_ERR_NO_FILE;
                if ($error === UPLOAD_ERR_NO_FILE) {
                    continue;
                }
                $out[] = [
                    'name' => (string) ($f['name'][$i] ?? ''),
                    'type' => (string) ($f['type'][$i] ?? ''),
                    'tmp_name' => (string) ($f['tmp_name'][$i] ?? ''),
                    'error' => (int) $error,
                    'size' => (int) ($f['size'][$i] ?? 0),
                ];
            }
            return $out;
        }

        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return [];
        }
        return [[
            'name' => (string) ($f['name'] ?? ''),
            'type' => (string) ($f['type'] ?? ''),
            'tmp_name' => (string) ($f['tmp_name'] ?? ''),
            'error' => (int) ($f['error'] ?? 0),
            'size' => (int) ($f['size'] ?? 0),
        ]];
    }

    /**
     * All photo uploads across the recognised field names.
     *
     * @return array<int,array{name:string,type:string,tmp_name:string,error:int,size:int}>
     */
    public static function allPhotoFiles(): array
    {
        $out = [];
        foreach (['photos', 'progressPhotos', 'afterPhotos'] as $field) {
            foreach (self::files($field) as $file) {
                $out[] = $file;
            }
        }
        return $out;
    }
}
