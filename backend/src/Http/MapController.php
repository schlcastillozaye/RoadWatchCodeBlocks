<?php

namespace RoadWatch\Http;

use RoadWatch\Modules\ReportService;
use RoadWatch\Services\Geocoding;
use RoadWatch\Support\Auth;
use RoadWatch\Support\Request;
use RoadWatch\Support\Validate;

class MapController
{
    public static function reports(): array
    {
        return ReportService::listPublic(ReportService::parseListQuery());
    }

    public static function report(array $params): array
    {
        $actor = Auth::optionalAuthenticate();
        if ($actor === null) {
            return ['report' => ReportService::getPublicMapDetail($params['id'])];
        }
        // Signed-in users must still be able to open public (approved) map pins
        // that belong to other citizens.
        return ['report' => ReportService::getForViewer($params['id'], $actor)];
    }

    public static function reverseGeocode(): array
    {
        $lat = Validate::number(Request::query('lat'), 'lat', -90, 90);
        $lng = Validate::number(Request::query('lng'), 'lng', -180, 180);
        return Geocoding::reverse($lat, $lng);
    }

    public static function searchPlaces(): array
    {
        $q = Validate::string(Request::query('q'), 'q', true, 2, 200, 'Enter at least 2 characters.');
        $limitRaw = Request::query('limit');
        $limit = 5;
        if ($limitRaw !== null && $limitRaw !== '') {
            if (!is_numeric($limitRaw)) {
                Validate::fail('limit', 'limit must be a number.');
            }
            $limit = (int) $limitRaw;
            if ($limit < 1 || $limit > 10) {
                Validate::fail('limit', 'limit must be between 1 and 10.');
            }
        }
        return Geocoding::search($q, $limit);
    }
}
