<?php

namespace RoadWatch\Support;

/**
 * Atomically generates the next human-readable report reference number.
 * Format: RW-<year>-<6-digit sequence>, e.g. RW-2026-000042.
 *
 * Uses a per-year counter row updated inside the caller's transaction so that
 * concurrent submissions can never collide. Must be called inside a
 * transaction (see Db::transaction).
 */
class Reference
{
    public static function next(?int $year = null): string
    {
        $year = $year ?? (int) gmdate('Y');

        Db::execute(
            'INSERT INTO `ReferenceCounter` (`year`, `value`) VALUES (?, 0) ON DUPLICATE KEY UPDATE `year` = `year`',
            [$year]
        );
        Db::execute('UPDATE `ReferenceCounter` SET `value` = `value` + 1 WHERE `year` = ?', [$year]);
        $seq = (int) Db::scalar('SELECT `value` FROM `ReferenceCounter` WHERE `year` = ?', [$year]);
        if ($seq < 1) {
            $seq = 1;
        }

        return sprintf('RW-%d-%06d', $year, $seq);
    }
}
