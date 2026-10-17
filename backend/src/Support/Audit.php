<?php

namespace RoadWatch\Support;

/** Audit log + immutable report status-history writers. */
class Audit
{
    /**
     * Append an audit-log entry. Never throws into the caller.
     *
     * @param array{actorId?:?string,actorRole?:?string,action:string,entityType:string,entityId?:?string,metadata?:mixed,ipAddress?:?string,userAgent?:?string} $input
     */
    public static function record(array $input): void
    {
        try {
            Db::execute(
                'INSERT INTO `AuditLog` (`id`, `actorId`, `actorRole`, `action`, `entityType`, `entityId`, `metadata`, `ipAddress`, `userAgent`, `createdAt`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    Ids::cuid(),
                    $input['actorId'] ?? null,
                    $input['actorRole'] ?? null,
                    $input['action'],
                    $input['entityType'],
                    $input['entityId'] ?? null,
                    isset($input['metadata']) ? json_encode($input['metadata'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
                    $input['ipAddress'] ?? null,
                    $input['userAgent'] ?? null,
                    Dates::toDb(Dates::now()),
                ]
            );
        } catch (\Throwable $e) {
            rw_log('warn', 'Failed to write audit log', $e->getMessage());
        }
    }

    /**
     * Append an immutable status-history row.
     *
     * @param array{reportId:string,type:string,fromValue?:?string,toValue:string,note?:?string,actorId?:?string,actorRole?:?string,createdAt?:?\DateTimeInterface} $input
     */
    public static function history(array $input): void
    {
        $createdAt = $input['createdAt'] ?? Dates::now();
        Db::execute(
            'INSERT INTO `StatusHistory` (`id`, `reportId`, `type`, `fromValue`, `toValue`, `note`, `actorId`, `actorRole`, `createdAt`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                Ids::cuid(),
                $input['reportId'],
                $input['type'],
                $input['fromValue'] ?? null,
                $input['toValue'],
                $input['note'] ?? null,
                $input['actorId'] ?? null,
                $input['actorRole'] ?? null,
                Dates::toDb($createdAt),
            ]
        );
    }

    /** Convenience wrapper capturing request metadata from the current request. */
    public static function actorContext(): array
    {
        return ['ipAddress' => Request::ip(), 'userAgent' => Request::userAgent()];
    }
}
