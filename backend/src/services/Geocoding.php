<?php

namespace RoadWatch\Services;

use RoadWatch\Support\Config;

/**
 * Server-side geocoding with two interchangeable providers:
 *
 *  - Google — used automatically when GOOGLE_MAPS_SERVER_API_KEY is set.
 *  - OpenStreetMap Nominatim — the default, always free, no key required.
 *
 * Every failure is a graceful `available: false` result (never a thrown
 * error) so clients can fall back to text filtering.
 */
class Geocoding
{
    private const REQUEST_TIMEOUT = 8;
    private const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
    private const NOMINATIM_USER_AGENT =
        'RoadWatch/1.0 (road issue reporting; +https://github.com/schlcastillozaye/RoadWatchCodeBlocks)';
    private const NOMINATIM_MIN_INTERVAL_MS = 1000;

    public static function provider(): string
    {
        return Config::googleMapsServerKey() !== '' ? 'google' : 'nominatim';
    }

    public static function reverse(float $lat, float $lng): array
    {
        try {
            if (self::provider() === 'google') {
                return self::googleReverse($lat, $lng);
            }
            return self::nominatimReverse($lat, $lng);
        } catch (\Throwable $e) {
            rw_log('warn', 'reverse geocoding failed', $e->getMessage());
            return ['available' => false, 'address' => null, 'areaLabel' => null, 'reason' => 'Geocoding service unavailable.'];
        }
    }

    public static function search(string $query, int $limit = 5): array
    {
        try {
            if (self::provider() === 'google') {
                return self::googleSearch($query, $limit);
            }
            return self::nominatimSearch($query, $limit);
        } catch (\Throwable $e) {
            rw_log('warn', 'place search failed', $e->getMessage());
            return ['available' => false, 'results' => [], 'reason' => 'Geocoding service unavailable.'];
        }
    }

    // -- OpenStreetMap Nominatim --------------------------------------------

    private static function nominatimReverse(float $lat, float $lng): array
    {
        $url = self::NOMINATIM_BASE . '/reverse?' . http_build_query([
            'lat' => $lat,
            'lon' => $lng,
            'format' => 'jsonv2',
            'addressdetails' => '1',
            'zoom' => '18',
        ]);
        $data = self::nominatimFetch($url);
        $address = $data['display_name'] ?? null;
        return [
            'available' => (bool) $address,
            'address' => $address,
            'areaLabel' => self::nominatimAreaLabel($data['address'] ?? null),
            'reason' => $address ? null : 'No matching place was found.',
        ];
    }

    private static function nominatimSearch(string $query, int $limit): array
    {
        $url = self::NOMINATIM_BASE . '/search?' . http_build_query([
            'q' => $query,
            'format' => 'jsonv2',
            'addressdetails' => '1',
            'limit' => $limit,
        ]);
        $data = self::nominatimFetch($url);
        $items = is_array($data) ? array_slice($data, 0, $limit) : [];
        $results = [];
        foreach ($items as $item) {
            $lat = isset($item['lat']) ? (float) $item['lat'] : NAN;
            $lng = isset($item['lon']) ? (float) $item['lon'] : NAN;
            if (!is_finite($lat) || !is_finite($lng)) {
                continue;
            }
            $results[] = [
                'address' => (string) ($item['display_name'] ?? ''),
                'lat' => $lat,
                'lng' => $lng,
                'areaLabel' => self::nominatimAreaLabel($item['address'] ?? null),
            ];
        }
        return [
            'available' => count($results) > 0,
            'results' => $results,
            'reason' => count($results) > 0 ? null : 'No matching place was found.',
        ];
    }

    private static function nominatimFetch(string $url)
    {
        self::throttleNominatim();
        $response = self::httpGet($url, [
            'Accept: application/json',
            'Accept-Language: en',
            'User-Agent: ' . self::NOMINATIM_USER_AGENT,
        ]);
        return json_decode($response, true);
    }

    /** Serialise Nominatim calls to at most one request per second. */
    private static function throttleNominatim(): void
    {
        $dir = rtrim(sys_get_temp_dir(), '/\\') . '/roadwatch_geocode';
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $file = $dir . '/last_nominatim';
        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return;
        }
        try {
            if (flock($handle, LOCK_EX)) {
                $last = (int) trim((string) stream_get_contents($handle));
                $nowMs = (int) round(microtime(true) * 1000);
                $waitMs = self::NOMINATIM_MIN_INTERVAL_MS - ($nowMs - $last);
                if ($waitMs > 0) {
                    usleep($waitMs * 1000);
                }
                ftruncate($handle, 0);
                rewind($handle);
                fwrite($handle, (string) ((int) round(microtime(true) * 1000)));
                fflush($handle);
                flock($handle, LOCK_UN);
            }
        } finally {
            fclose($handle);
        }
    }

    private static function nominatimAreaLabel($address): ?string
    {
        if (!is_array($address)) {
            return null;
        }
        foreach (['city', 'town', 'village', 'municipality', 'city_district', 'suburb', 'county', 'state', 'region'] as $key) {
            if (!empty($address[$key])) {
                return (string) $address[$key];
            }
        }
        return null;
    }

    // -- Google --------------------------------------------------------------

    private static function googleReverse(float $lat, float $lng): array
    {
        $url = 'https://maps.googleapis.com/maps/api/geocode/json?' . http_build_query([
            'latlng' => $lat . ',' . $lng,
            'key' => Config::googleMapsServerKey(),
        ]);
        $data = json_decode(self::httpGet($url, ['Accept: application/json']), true) ?: [];
        $first = $data['results'][0] ?? null;
        return [
            'available' => (bool) $first,
            'address' => $first['formatted_address'] ?? null,
            'areaLabel' => self::googleAreaLabel($first),
            'reason' => $first ? null : self::describeGoogleStatus((string) ($data['status'] ?? ''), $data['error_message'] ?? null),
        ];
    }

    private static function googleSearch(string $query, int $limit): array
    {
        $url = 'https://maps.googleapis.com/maps/api/geocode/json?' . http_build_query([
            'address' => $query,
            'key' => Config::googleMapsServerKey(),
        ]);
        $data = json_decode(self::httpGet($url, ['Accept: application/json']), true) ?: [];
        $results = [];
        foreach (array_slice($data['results'] ?? [], 0, $limit) as $result) {
            $location = $result['geometry']['location'] ?? [];
            $results[] = [
                'address' => (string) ($result['formatted_address'] ?? ''),
                'lat' => (float) ($location['lat'] ?? 0),
                'lng' => (float) ($location['lng'] ?? 0),
                'areaLabel' => self::googleAreaLabel($result),
            ];
        }
        return [
            'available' => count($results) > 0,
            'results' => $results,
            'reason' => count($results) > 0 ? null : self::describeGoogleStatus((string) ($data['status'] ?? ''), $data['error_message'] ?? null),
        ];
    }

    private static function googleAreaLabel($result): ?string
    {
        if (!is_array($result) || !isset($result['address_components'])) {
            return null;
        }
        foreach ($result['address_components'] as $component) {
            $types = $component['types'] ?? [];
            if (in_array('sublocality', $types, true) || in_array('locality', $types, true)) {
                return $component['long_name'] ?? null;
            }
        }
        return null;
    }

    private static function describeGoogleStatus(string $status, ?string $errorMessage): string
    {
        switch ($status) {
            case 'ZERO_RESULTS':
                return 'No matching place was found.';
            case 'REQUEST_DENIED':
                return $errorMessage
                    ? 'Google rejected the request: ' . $errorMessage
                    : 'Google rejected the request — check that billing is enabled and the Geocoding API is turned on.';
            case 'OVER_QUERY_LIMIT':
                return 'The Google Maps quota for this project has been exceeded.';
            case 'OVER_DAILY_LIMIT':
                return 'The daily Google Maps limit has been reached. Try again tomorrow.';
            case 'INVALID_REQUEST':
                return 'That search was not understood — try a more specific address.';
            default:
                return 'No result (' . $status . ').';
        }
    }

    // -- HTTP ----------------------------------------------------------------

    private static function httpGet(string $url, array $headers): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::REQUEST_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => self::REQUEST_TIMEOUT,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false || $status >= 400) {
            throw new \RuntimeException('Geocoding HTTP error: ' . ($error !== '' ? $error : 'status ' . $status));
        }
        return (string) $body;
    }
}
