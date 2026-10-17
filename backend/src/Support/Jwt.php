<?php

namespace RoadWatch\Support;

/**
 * Minimal, dependency-free JWT (HS256) implementation compatible with the
 * jsonwebtoken tokens the original system issued.
 */
class Jwt
{
    public static function sign(array $payload, string $secret, int $ttlSeconds): string
    {
        $issuedAt = time();
        $payload = array_merge($payload, ['iat' => $issuedAt]);
        if ($ttlSeconds > 0) {
            $payload['exp'] = $issuedAt + $ttlSeconds;
        }

        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $segments = [
            self::base64UrlEncode(self::jsonEncode($header)),
            self::base64UrlEncode(self::jsonEncode($payload)),
        ];
        $signingInput = implode('.', $segments);
        $signature = hash_hmac('sha256', $signingInput, $secret, true);
        $segments[] = self::base64UrlEncode($signature);

        return implode('.', $segments);
    }

    /**
     * Verify and decode a token. Returns the payload array, or null when the
     * token is malformed, has a bad signature, or has expired.
     */
    public static function verify(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $expected = hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true);
        $actual = self::base64UrlDecode($signatureB64);
        if (!hash_equals($expected, $actual)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!is_array($payload)) {
            return null;
        }

        if (isset($payload['exp']) && is_numeric($payload['exp']) && (int) $payload['exp'] < time()) {
            return null;
        }
        if (isset($payload['nbf']) && is_numeric($payload['nbf']) && (int) $payload['nbf'] > time()) {
            return null;
        }

        return $payload;
    }

    private static function jsonEncode(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }
}
