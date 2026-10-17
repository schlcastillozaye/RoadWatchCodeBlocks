<?php

namespace RoadWatch\Support;

/**
 * Identifier generation. Produces cuid-shaped string ids (25 chars, leading
 * "c") so they are visually consistent with the existing records created by
 * Prisma, while remaining collision-resistant.
 */
class Ids
{
    private const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

    public static function cuid(): string
    {
        $timestamp = self::toBase36((int) round(microtime(true) * 1000));
        $timestamp = str_pad($timestamp, 8, '0', STR_PAD_LEFT);
        if (strlen($timestamp) > 8) {
            $timestamp = substr($timestamp, -8);
        }
        $random = '';
        for ($i = 0; $i < 16; $i++) {
            $random .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }
        return 'c' . $timestamp . $random;
    }

    private static function toBase36(int $value): string
    {
        if ($value === 0) {
            return '0';
        }
        $out = '';
        while ($value > 0) {
            $out = self::ALPHABET[$value % 36] . $out;
            $value = intdiv($value, 36);
        }
        return $out;
    }
}
