<?php

namespace RoadWatch\Support;

/**
 * Simple file-backed fixed-window rate limiter. Adequate for single-instance
 * deployments; keeps the same behaviour clients expect (429 RATE_LIMITED).
 */
class RateLimit
{
    public static function hit(string $name, int $max, int $windowSeconds, string $message = 'Too many requests. Please slow down.'): void
    {
        $ip = Request::ip() ?? 'unknown';
        $dir = rtrim(sys_get_temp_dir(), '/\\') . '/roadwatch_ratelimit';
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $safe = preg_replace('/[^a-zA-Z0-9_.-]/', '_', $name . '_' . $ip);
        $file = $dir . '/' . $safe . '.json';

        $now = time();
        $bucket = ['count' => 0, 'reset' => $now + $windowSeconds];
        if (is_file($file)) {
            $decoded = json_decode((string) @file_get_contents($file), true);
            if (is_array($decoded) && ($decoded['reset'] ?? 0) > $now) {
                $bucket = ['count' => (int) ($decoded['count'] ?? 0), 'reset' => (int) $decoded['reset']];
            }
        }

        $bucket['count']++;
        @file_put_contents($file, json_encode($bucket), LOCK_EX);

        if ($bucket['count'] > $max) {
            $retryAfter = max(1, $bucket['reset'] - $now);
            Response::header('Retry-After', (string) $retryAfter);
            throw new AppError($message, 429, 'RATE_LIMITED');
        }
    }
}
