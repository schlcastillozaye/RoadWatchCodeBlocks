<?php

namespace RoadWatch\Support;

/**
 * Converts any throwable into the standard JSON error envelope, matching the
 * status codes and machine codes the original API produced.
 */
class ErrorHandler
{
    public static function handle(\Throwable $e, string $method = '', string $path = ''): void
    {
        [$status, $code, $message, $details] = self::normalize($e);

        if ($status >= 500) {
            rw_log('error', "{$method} {$path} -> {$status}", ['message' => $e->getMessage(), 'file' => $e->getFile() . ':' . $e->getLine()]);
        } else {
            rw_log('debug', "{$method} {$path} -> {$status} {$code} {$message}");
        }

        Response::reset();
        Response::status($status);

        $payload = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $payload['details'] = $details;
        }
        Response::send(['error' => $payload]);
    }

    /** @return array{0:int,1:string,2:string,3:mixed} */
    private static function normalize(\Throwable $e): array
    {
        if ($e instanceof AppError) {
            return [$e->status, $e->errorCode, $e->getMessage(), $e->details];
        }

        if ($e instanceof \PDOException) {
            $sqlState = $e->getCode();
            if ($sqlState === '23000' || $sqlState === 23000) {
                $field = self::duplicateField($e->getMessage());
                return [409, 'DUPLICATE', "A record with this {$field} already exists.", null];
            }
            return [400, 'DB_ERROR', 'Database request error.', null];
        }

        if ($e instanceof \InvalidArgumentException) {
            return [400, 'BAD_REQUEST', $e->getMessage(), null];
        }

        return [
            500,
            'INTERNAL_ERROR',
            Config::isProd() ? 'Internal server error' : $e->getMessage(),
            null,
        ];
    }

    private static function duplicateField(string $message): string
    {
        if (preg_match("/for key '([^']+)'/", $message, $m)) {
            $key = preg_replace('/_key$/', '', $m[1]) ?? $m[1];
            $key = preg_replace('/^[A-Za-z]+_/', '', $key) ?? $key;
            return str_replace('_', ', ', $key);
        }
        return 'field';
    }
}
