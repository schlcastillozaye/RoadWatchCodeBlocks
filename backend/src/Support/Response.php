<?php

namespace RoadWatch\Support;

/**
 * Collects the outgoing response. Handlers return a JSON-serialisable value
 * (which is sent with the current status), stream file bytes directly, or
 * return null when they have already produced output.
 */
class Response
{
    private static int $status = 200;
    /** @var array<string,string> */
    private static array $headers = [];
    private static bool $sent = false;

    public static function status(int $status): void
    {
        self::$status = $status;
    }

    public static function header(string $name, string $value): void
    {
        self::$headers[$name] = $value;
    }

    public static function sent(): bool
    {
        return self::$sent;
    }

    /** Reset accumulated state (used by the error handler). */
    public static function reset(): void
    {
        self::$status = 200;
        self::$headers = [];
        self::$sent = false;
    }

    public static function send($data): void
    {
        if (self::$sent) {
            return;
        }
        self::$sent = true;

        http_response_code(self::$status);
        foreach (self::$headers as $name => $value) {
            header($name . ': ' . $value);
        }
        if ($data === null) {
            return;
        }
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /** Stream raw bytes (used by the authorised file endpoint). */
    public static function stream(string $body, array $headers = [], int $status = 200): void
    {
        if (self::$sent) {
            return;
        }
        self::$sent = true;
        http_response_code($status);
        foreach ($headers as $name => $value) {
            header($name . ': ' . $value);
        }
        echo $body;
    }
}
