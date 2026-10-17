<?php

namespace RoadWatch\Services;

use RoadWatch\Support\Config;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;
use RoadWatch\Support\Dates;

/**
 * Optional image-processing module. Disabled by default; when enabled it calls
 * a remote HTTP analysis API. Failures are never fatal — analysis is stored
 * separately and must never block report submission, moderation or maps.
 */
class ImageProcessing
{
    public static function enabled(): bool
    {
        return Config::imageProcessingEnabled()
            && Config::imageProcessingProvider() !== 'none'
            && Config::imageProcessingApiUrl() !== '';
    }

    public static function name(): string
    {
        if (!self::enabled()) {
            return 'none';
        }
        return Config::imageProcessingProvider();
    }

    /**
     * Fire-and-forget analysis for a single photo. Records the outcome in
     * ImageAnalysisResult. Never throws into the caller.
     */
    public static function schedule(string $reportId, ?string $photoId, string $imageUrl): void
    {
        if (!self::enabled()) {
            return;
        }
        try {
            $outcome = self::call('/analyze', [
                'reportId' => $reportId,
                'photoId' => $photoId,
                'imageUrl' => $imageUrl,
            ]);
            Db::execute(
                'INSERT INTO `ImageAnalysisResult` (`id`, `reportId`, `photoId`, `provider`, `status`, `result`, `confidence`, `error`, `createdAt`, `updatedAt`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    Ids::cuid(),
                    $reportId,
                    $photoId,
                    self::name(),
                    $outcome['status'],
                    isset($outcome['result']) ? json_encode($outcome['result'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
                    $outcome['confidence'] ?? null,
                    $outcome['error'] ?? null,
                    Dates::toDb(Dates::now()),
                    Dates::toDb(Dates::now()),
                ]
            );
        } catch (\Throwable $e) {
            rw_log('warn', 'Image analysis failed (non-fatal)', $e->getMessage());
        }
    }

    /** @return array{provider:string,status:string,result?:mixed,confidence?:?float,error?:?string} */
    private static function call(string $path, array $body): array
    {
        $url = rtrim(Config::imageProcessingApiUrl(), '/') . $path;
        $headers = ['Content-Type: application/json'];
        $key = Config::imageProcessingApiKey();
        if ($key !== '') {
            $headers[] = 'Authorization: Bearer ' . $key;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['provider' => self::name(), 'status' => 'FAILED', 'error' => $error !== '' ? $error : 'request failed'];
        }
        if ($status >= 400) {
            return ['provider' => self::name(), 'status' => 'FAILED', 'error' => 'Provider responded ' . $status];
        }
        $json = json_decode((string) $response, true);
        if (!is_array($json)) {
            return ['provider' => self::name(), 'status' => 'FAILED', 'error' => 'Invalid provider response'];
        }
        return [
            'provider' => self::name(),
            'status' => 'COMPLETED',
            'result' => $json['result'] ?? $json,
            'confidence' => isset($json['confidence']) ? (float) $json['confidence'] : null,
        ];
    }
}
