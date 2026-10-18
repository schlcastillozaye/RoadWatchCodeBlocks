<?php

namespace RoadWatch\Http;

use RoadWatch\Services\Geocoding;
use RoadWatch\Services\ImageProcessing;
use RoadWatch\Services\Storage;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;

class HealthController
{
    public static function health(): array
    {
        $database = 'unknown';
        try {
            Db::scalar('SELECT 1');
            $database = 'up';
        } catch (\Throwable $e) {
            $database = 'down';
        }

        return [
            'status' => 'ok',
            'service' => 'roadwatch-api',
            'database' => $database,
            'storage' => Storage::name(),
            'imageProcessing' => ImageProcessing::enabled() ? ImageProcessing::name() : 'disabled',
            'geocoding' => Geocoding::status(),
            'time' => Dates::iso(Dates::now()),
        ];
    }

    public static function root(): array
    {
        return ['name' => 'RoadWatch API', 'version' => '1.0.0', 'docs' => '/health'];
    }
}
