<?php

/**
 * Regression test for Config::publicBaseUrl().
 *
 * Photo URLs handed to the mobile app and the web platform must be built from a
 * publicly reachable origin. Copying the development default
 * (`PUBLIC_BASE_URL=http://localhost:4000`) into a host's variables used to make
 * every photo URL point at the visitor's own machine, so images silently failed
 * to load on a real deployment. The fallback under test derives the origin from
 * the request in that (misconfigured) case only.
 *
 * Run:  php tests/config_test.php
 */

require __DIR__ . '/../src/Support/Env.php';
require __DIR__ . '/../src/Support/Config.php';

use RoadWatch\Support\Config;

$passed = 0;
$failed = 0;

function check(string $name, $actual, $expected): void
{
    global $passed, $failed;
    if ($actual === $expected) {
        $passed++;
        echo "  \u{2713} {$name}\n";
        return;
    }
    $failed++;
    echo "  \u{2717} {$name}\n      expected: " . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n";
}

/** @param array<string,string> $server */
function configure(string $publicBaseUrl, array $server = []): string
{
    putenv('PUBLIC_BASE_URL=' . $publicBaseUrl);
    $_SERVER = ['REQUEST_METHOD' => 'GET'] + $server;
    return Config::publicBaseUrl();
}

$railway = 'roadwatchcodeblocks-production.up.railway.app';

echo "\n=== Config::publicBaseUrl ===\n";

check(
    'a real configured origin is used as-is',
    configure('https://api.example.com', ['HTTP_HOST' => 'internal:8080']),
    'https://api.example.com'
);

check(
    'a real configured origin is never overridden by proxy headers',
    configure('https://api.example.com', [
        'HTTP_HOST' => $railway,
        'HTTP_X_FORWARDED_HOST' => $railway,
        'HTTP_X_FORWARDED_PROTO' => 'https',
    ]),
    'https://api.example.com'
);

check(
    'the dev default (localhost) falls back to the request origin',
    configure('http://localhost:4000', ['HTTP_HOST' => '127.0.0.1:4011']),
    'http://127.0.0.1:4011'
);

check(
    'the dev default behind a reverse proxy uses the forwarded origin',
    configure('http://localhost:4000', [
        'HTTP_HOST' => 'internal-abc.railway.internal',
        'HTTP_X_FORWARDED_HOST' => $railway,
        'HTTP_X_FORWARDED_PROTO' => 'https',
    ]),
    'https://' . $railway
);

check(
    'an unset origin falls back to the request origin',
    configure('', ['HTTP_HOST' => 'roadwatch.example.gov']),
    'http://roadwatch.example.gov'
);

check(
    'a scheme-less localhost value falls back too',
    configure('localhost:4000', ['HTTP_HOST' => '192.168.1.20:4000']),
    'http://192.168.1.20:4000'
);

check(
    'an IPv6 loopback origin falls back too',
    configure('http://[::1]:4000', ['HTTP_HOST' => 'api.example.gov', 'HTTPS' => 'on']),
    'https://api.example.gov'
);

check(
    'outside a request the configured value is kept (CLI: seed, migrate)',
    configure('http://localhost:4000'),
    'http://localhost:4000'
);

check(
    'a chained forwarded host is reduced to the first entry',
    configure('', ['HTTP_X_FORWARDED_HOST' => 'api.example.gov, proxy.internal']),
    'http://api.example.gov'
);

check(
    'a malformed host header never reaches a URL',
    configure('http://localhost:4000', ['HTTP_HOST' => 'evil.example/../x']),
    'http://localhost:4000'
);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
