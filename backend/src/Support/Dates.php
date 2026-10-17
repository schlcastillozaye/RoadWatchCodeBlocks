<?php

namespace RoadWatch\Support;

/**
 * Date helpers. The database stores UTC; the API emits ISO-8601 strings with
 * millisecond precision and a trailing Z, matching JavaScript's toISOString().
 */
class Dates
{
    public static function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public static function nowMs(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    /** Format a DateTime for a DATETIME(3) column. */
    public static function toDb(\DateTimeInterface $dt): string
    {
        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    }

    /** Convert a database value (UTC) into an ISO-8601 string. */
    public static function iso($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            $dt = $value;
        } else {
            try {
                $dt = new \DateTimeImmutable((string) $value, new \DateTimeZone('UTC'));
            } catch (\Throwable $e) {
                return null;
            }
        }
        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }

    /**
     * Coerce loose input (ISO strings, timestamps) into a UTC DateTime.
     * Returns null when the value cannot be interpreted.
     */
    public static function parse($value): ?\DateTimeImmutable
    {
        if ($value === null || $value === '' || $value === false) {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return (new \DateTimeImmutable($value->format('Y-m-d H:i:s.v'), new \DateTimeZone('UTC')));
        }
        if (is_int($value) || (is_string($value) && ctype_digit($value))) {
            return (new \DateTimeImmutable('@' . (int) $value))->setTimezone(new \DateTimeZone('UTC'));
        }
        try {
            return new \DateTimeImmutable((string) $value, new \DateTimeZone('UTC'));
        } catch (\Throwable $e) {
            return null;
        }
    }
}
