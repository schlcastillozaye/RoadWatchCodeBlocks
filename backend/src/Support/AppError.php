<?php

namespace RoadWatch\Support;

/**
 * Application-level error carrying an HTTP status and a stable machine code.
 * Converted into the standard JSON error envelope by the error handler.
 */
class AppError extends \RuntimeException
{
    public int $status;
    /** Stable machine code (distinct from Exception::$code, which is an int). */
    public string $errorCode;
    public $details;

    public function __construct(string $message = 'Bad request', int $status = 400, string $code = 'BAD_REQUEST', $details = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $code;
        $this->details = $details;
    }

    public static function badRequest(string $message = 'Bad request', $details = null): self
    {
        return new self($message, 400, 'BAD_REQUEST', $details);
    }

    public static function unauthenticated(string $message = 'Authentication required'): self
    {
        return new self($message, 401, 'UNAUTHENTICATED');
    }

    public static function forbidden(string $message = 'You do not have permission to perform this action'): self
    {
        return new self($message, 403, 'FORBIDDEN');
    }

    public static function notFound(string $message = 'Resource not found'): self
    {
        return new self($message, 404, 'NOT_FOUND');
    }

    public static function conflict(string $message = 'Resource already exists', $details = null): self
    {
        return new self($message, 409, 'CONFLICT', $details);
    }

    public static function unprocessable(string $message = 'Validation failed', $details = null): self
    {
        return new self($message, 422, 'UNPROCESSABLE_ENTITY', $details);
    }

    public static function validation(string $message = 'Validation failed', $details = null): self
    {
        return new self($message, 422, 'VALIDATION_ERROR', $details);
    }

    public static function unsupportedMedia(string $message = 'Unsupported media type'): self
    {
        return new self($message, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }

    public static function tooLarge(string $message = 'Payload too large'): self
    {
        return new self($message, 413, 'PAYLOAD_TOO_LARGE');
    }

    public static function internal(string $message = 'Internal server error'): self
    {
        return new self($message, 500, 'INTERNAL_ERROR');
    }
}
