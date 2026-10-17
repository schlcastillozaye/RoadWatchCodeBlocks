<?php

namespace RoadWatch\Support;

/**
 * Input validation helpers. Failures raise the standard 422 VALIDATION_ERROR
 * envelope with a `details` array, mirroring the original Zod behaviour.
 */
class Validate
{
    public static function fail(string $path, string $message): void
    {
        throw AppError::validation('Validation failed', [['path' => $path, 'message' => $message]]);
    }

    public static function string(
        $value,
        string $path,
        bool $required = true,
        int $min = 0,
        int $max = PHP_INT_MAX,
        ?string $minMessage = null,
        ?string $maxMessage = null,
        ?string $requiredMessage = null
    ): ?string {
        if ($value === null || $value === '' || (is_array($value))) {
            if ($required) {
                self::fail($path, $requiredMessage ?? "{$path} is required.");
            }
            return null;
        }
        $str = trim((string) $value);
        if ($str === '') {
            if ($required) {
                self::fail($path, $requiredMessage ?? "{$path} is required.");
            }
            return null;
        }
        $length = mb_strlen($str);
        if ($length < $min) {
            self::fail($path, $minMessage ?? "{$path} must be at least {$min} characters.");
        }
        if ($length > $max) {
            self::fail($path, $maxMessage ?? "{$path} must be at most {$max} characters.");
        }
        return $str;
    }

    /** @param string[] $allowed */
    public static function enum($value, string $path, array $allowed, bool $required = true, ?string $message = null): ?string
    {
        if ($value === null || $value === '' || is_array($value)) {
            if ($required) {
                self::fail($path, $message ?? "{$path} is required.");
            }
            return null;
        }
        $value = (string) $value;
        if (!in_array($value, $allowed, true)) {
            self::fail($path, $message ?? "Invalid value for {$path}.");
        }
        return $value;
    }

    public static function number($value, string $path, float $min, float $max, bool $required = true): ?float
    {
        if ($value === null || $value === '' || is_array($value)) {
            if ($required) {
                self::fail($path, "{$path} is required.");
            }
            return null;
        }
        if (!is_numeric($value)) {
            self::fail($path, "{$path} must be a number.");
        }
        $num = (float) $value;
        if ($num < $min) {
            self::fail($path, "{$path} must be greater than or equal to {$min}.");
        }
        if ($num > $max) {
            self::fail($path, "{$path} must be less than or equal to {$max}.");
        }
        return $num;
    }

    public static function date($value, string $path, bool $required = false): ?\DateTimeImmutable
    {
        if ($value === null || $value === '') {
            if ($required) {
                self::fail($path, "{$path} is required.");
            }
            return null;
        }
        $parsed = Dates::parse($value);
        if ($parsed === null) {
            self::fail($path, "{$path} must be a valid date.");
        }
        return $parsed;
    }

    public static function boolean($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value !== 0;
        }
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
    }
}
