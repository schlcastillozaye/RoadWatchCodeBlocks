<?php

namespace RoadWatch\Support;

/** Parses simple durations like "15m", "30d", "12h" into seconds. */
class Ttl
{
    private const UNITS = [
        'ms' => 0.001,
        's' => 1,
        'm' => 60,
        'h' => 3600,
        'd' => 86400,
        'w' => 604800,
    ];

    public static function toSeconds(string $ttl, int $fallbackSeconds = 0): int
    {
        if (preg_match('/^\s*(\d+)\s*(ms|s|m|h|d|w)\s*$/i', $ttl, $m)) {
            $value = (int) $m[1];
            $unit = strtolower($m[2]);
            return (int) round($value * (self::UNITS[$unit] ?? 0));
        }
        return $fallbackSeconds;
    }
}
