<?php

/**
 * RoadWatch seed data.
 *   php seed.php
 *
 * Creates demo accounts (see the console output or docs/DEMO_ACCOUNTS),
 * maintenance officers, and a realistic spread of reports across every
 * moderation/repair status. Safe to re-run: users are upserted and reports are
 * only seeded when the table is empty.
 *
 * This is a PHP port of the original prisma/seed.ts so the data it produces is
 * byte-for-byte compatible with the Prisma-created database.
 */

use RoadWatch\Modules\AccountService;
use RoadWatch\Services\Storage;
use RoadWatch\Support\Dates;
use RoadWatch\Support\Db;
use RoadWatch\Support\Ids;
use RoadWatch\Support\Reference;

require __DIR__ . '/src/bootstrap.php';

const RW_IMG_POTHOLE = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB0UlEQVR42u3cMU4DMRCG0c1oz5aKG6SiTcVRqNJS5QZUuZypoEAIVggR7z/vqyhIhObJBhF7D2OMRbmVEQDWjls/vjqdHo0jpuv1xQq2RQuwAAuwAAuwAAMWYAEWYAEWYAEGLMACLMACLMACLMCABViAtUxzdWXabrfXLd92PD7g3AfwRtHvX8V7OuDfuf74bs2l1zzaL9+8LfMaTIv5nsD/RtuceW1C25a5uulO+JPkAM820w7G1Xya8cZljtnGZYLZxj5s8Du4x+JIXcRlatnGtmhbtADH7Hh5u7QVbAULsAALsABrIuA9HpnIO+ZhBVvBApyx40UewytTy74AYYu2RTdYHMFnpMsEs0/AV/M5xt9vqM7T7HB7pdrOtMndpPVek73j2Qm3C2OZ3Q+OZXbDP5bZMzqm+5v2T6Q9ZWfexyh9svGcrPAHoZHzYYMAAxZgARZgARZgvXe5PC+7/keHNloCDrcEHG4JOMHyfH4C3NQScLgl4HBLwOGWgMMtAYdbtgPuZpkMzDIHmGUOMMscYJY5wCxzgFnmALPMAWaZA8zSFs0yEZhlDjDLJfhcNF0H3wVYgAVYgAUYsAALsAALsAALcOsOYwxTsIIFWFP2Bo+Dsw0CMb0JAAAAAElFTkSuQmCC';
const RW_IMG_FLOOD = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB1klEQVR42u3csU0DQRCG0fPoKqIJOiBwB0R04MAdENGBAzqgCVpaIggQghNCeO+f90UE2ELztAvCu3cYYyzKrYwAsHbc+vHV7cOTccT08nhvBduiBViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMBaprm6Mm2vl9OWb7s5nnHuA3ij6Pev4j0d8O9cf3y35tJrHu2Xb96WeQ2mxXxN4H+jbc68NqFty1zddCf8SXKAZ5tpB+NqPs144zLHbOMywWxjHzb4HdxjcaQu4jK1bGNbtC1agGN2vLxd2gq2ggVYgAVYgDUR8B6PTOQd87CCrWABztjxIo/hlallX4CwRduiGyyO4DPSZYLZJ+Cr+Rzj7zdU52l2uL1SbWfa5G7Seq3JXvHshNuFsczuB8cyu+Efy+wZHdP9Tfsn0p6yM+9jlD7ZeE5W+IPQyPmwQYABC7AAC7AAC7Deez4fl13/o0MbLQGHWwIOtwScYHl3ugBuagk43BJwuCXgcEvA4ZaAwy3bAXezTAZmmQPMMgeYZQ4wyxxgljnALHOAWeYAs8wBZmmLZpkIzDIHmOUSfC6aroPvAizAAizAAgxYgAVYgAVYgAW4dYcxhilYwQKsKXsD7E+zQ8VnY4cAAAAASUVORK5CYII=';
const RW_IMG_AFTER = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAByklEQVR42u3cQU7DMBRF0dTKUrMDJukKmgk7yF7NCAYI0ahCxHn/3BEDWqF/ZIOonVvvfVJuzQgA68LNX1/d3+/GEdPj7WEF26IFWIAFWIAFWIABC7AAC7AAC7AAAxZgARZgARZgARZgwAIswJqGuboybPu2H/m2ZV1wXgP4oOjvr+I9HPBrrk/frbj0nEf745uXZZ6DaTGfCfxvtMWZ5yK0ZZlbNd0Bf5Ic4NFmWsG4FZ9mvHEzx2zjZoLZxj5s8Du4xuJIXcTN1LKNbdG2aAGO2fHydmkr2AoWYAEWYAHWQMBXPDKRd8zDCraCBThjx4s8htdMLfsChC3aFl1gcQSfkW4mmH0CvhWfY/z9hlZ5mhVur7SyMy1yN2k+a7Innp1wuzCW2f3gWGY3/GOZPaNjuL9p/0TaU3bGfYzSNxvPyQp/EBo5HzYIMGABFmABFmAB1mfrsk6X/keHDloCDrcEHG4JOMFy2zfARS0Bh1sCDrcEHG4JONwScLhlOeBqlsnALHOAWeYAs8wBZpkDzDIHmGUOMMscYJY5wCxt0SwTgVnmALOcgs9F03XwXYAFWIAFWIABC7AAC7AAC7AAl+7WezcFK1iANWQfHPSzda60kiIAAAAASUVORK5CYII=';
const RW_IMG_CRACK = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB1UlEQVR42u3cIUtEQRSG4buH++OMZsFoEyxmg9ki2IyC2ei/G5MGEV1EvHO/87zJ4C5yHmYUd+YexhiLcisjAKwdt358dXVxbhwx3T8+WcG2aAEWYAEWYAEWYMACLMACLMACLMCABViABViABViABRiwAAuwlmmurkzb88vrMd92dnqCcx/AR4p+/yre0wH/zvXHd2suvebRfvnmbZnXYFrMWwL/G21z5rUJbVvm6qY74U+SAzzbTDsYV/NpxhuXOWYblwlmG/uwwe/gHosjdRGXqWUb26Jt0QIcs+Pl7dJWsBUswAIswAKsiYD3eGQi75iHFWwFC3DGjhd5DK9MLfsChC3aFt1gcQSfkS4TzD4BX83nGH+/oTpPs8PtlWo70yZ3k9atJrvh2Qm3C2OZ3Q+OZXbDP5bZMzqm+5v2T6Q9ZWfexyh9svGcrPAHoZHzYYMAAxZgARZgARZgvXd797Ds+h8dOtIScLgl4HBLwAmWN9eXgJtaAg63BBxuCTjcEnC4JeBwy3bA3SyTgVnmALPMAWaZA8wyB5hlDjDLHGCWOcAsc4BZ2qJZJgKzzAFmuQSfi6br4LsAC7AAC7AAAxZgARZgARZgAW7dYYxhClawAGvK3gCy8rMnVHsz1QAAAABJRU5ErkJggg==';

/**
 * Insert-or-fetch a demo user by email. Mirrors Prisma's `upsert({update:{}})`:
 * an existing account is left untouched.
 *
 * @return array<string,mixed>
 */
function seed_upsert_user(string $fullName, string $email, ?string $phone, string $passwordHash, string $role): array
{
    $existing = Db::one('SELECT * FROM `User` WHERE `email` = ?', [$email]);
    if ($existing !== null) {
        return $existing;
    }

    $now = Dates::toDb(Dates::now());
    $id = Ids::cuid();
    Db::execute(
        'INSERT INTO `User` (`id`,`fullName`,`email`,`phone`,`passwordHash`,`role`,`status`,`avatarKey`,`createdAt`,`updatedAt`)
         VALUES (?,?,?,?,?,?,?,?,?,?)',
        [$id, $fullName, $email, $phone, $passwordHash, $role, 'ACTIVE', null, $now, $now]
    );

    /** @var array<string,mixed> $row */
    $row = Db::one('SELECT * FROM `User` WHERE `id` = ?', [$id]);
    return $row;
}

function seed_required_password(string $name): string
{
    $password = getenv($name);
    if (!is_string($password) || $password === '') {
        throw new RuntimeException('Missing required seed environment variable: ' . $name);
    }
    return $password;
}

/**
 * @return array{admin:array,officer1:array,officer2:array,citizen1:array,citizen2:array}
 */
function seed_users(): array
{
    $adminHash = AccountService::hashPassword(seed_required_password('RW_SEED_ADMIN_PASSWORD'));
    $officerHash = AccountService::hashPassword(seed_required_password('RW_SEED_OFFICER_PASSWORD'));
    $citizen1Hash = AccountService::hashPassword(seed_required_password('RW_SEED_CITIZEN_PASSWORD'));
    $citizen2Hash = AccountService::hashPassword(seed_required_password('RW_SEED_CITIZEN2_PASSWORD'));

    return [
        'admin' => seed_upsert_user('Maria Santos', 'admin@roadwatch.gov', '+63 917 000 0001', $adminHash, 'ADMIN'),
        'officer1' => seed_upsert_user('Miguel Reyes', 'officer1@roadwatch.gov', '+63 917 000 0002', $officerHash, 'MAINTENANCE_OFFICER'),
        'officer2' => seed_upsert_user('Ana Dela Cruz', 'officer2@roadwatch.gov', '+63 917 000 0003', $officerHash, 'MAINTENANCE_OFFICER'),
        'citizen1' => seed_upsert_user('Juan Dela Cruz', 'citizen@example.com', '+63 917 000 0004', $citizen1Hash, 'CITIZEN'),
        'citizen2' => seed_upsert_user('Liza Ramos', 'citizen2@example.com', '+63 917 000 0005', $citizen2Hash, 'CITIZEN'),
    ];
}

/** @param array<string,array<string,mixed>> $users */
function seed_reports(array $users): void
{
    $existing = (int) Db::scalar('SELECT COUNT(*) FROM `Report`');
    if ($existing > 0) {
        echo "Skipping report seeding — {$existing} report(s) already exist." . PHP_EOL;
        return;
    }

    $images = [
        'pothole' => base64_decode(RW_IMG_POTHOLE),
        'flood' => base64_decode(RW_IMG_FLOOD),
        'after' => base64_decode(RW_IMG_AFTER),
        'crack' => base64_decode(RW_IMG_CRACK),
    ];

    $rows = [
        [
            'title' => 'Large pothole on Aurora Boulevard',
            'description' => 'A deep pothole has formed in the middle lane near the intersection. It is a hazard for motorcycles, especially at night.',
            'category' => 'POTHOLE',
            'priority' => 'HIGH',
            'latitude' => 14.6182,
            'longitude' => 121.0218,
            'addressText' => 'Aurora Blvd, Quezon City, Metro Manila',
            'areaLabel' => 'Quezon City',
            'moderationStatus' => 'APPROVED',
            'repairStatus' => 'COMPLETED',
            'rejectionReason' => null,
            'citizenId' => $users['citizen1']['id'],
            'before' => 'pothole',
            'after' => 'after',
            'completionNotes' => 'Pothole filled and levelled with hot-mix asphalt. Area compacted and left clear for traffic.',
            'assignedOfficerId' => $users['officer1']['id'],
            'daysAgo' => 12,
        ],
        [
            'title' => 'Flooding along Espana Boulevard',
            'description' => 'Knee-deep flooding after heavy rain. Drainage appears clogged and water is not receding, affecting jeepney routes.',
            'category' => 'FLOODING',
            'priority' => 'URGENT',
            'latitude' => 14.6091,
            'longitude' => 120.9891,
            'addressText' => 'Espana Blvd, Sampaloc, Manila',
            'areaLabel' => 'Manila',
            'moderationStatus' => 'APPROVED',
            'repairStatus' => 'IN_PROGRESS',
            'rejectionReason' => null,
            'citizenId' => $users['citizen2']['id'],
            'before' => 'flood',
            'after' => null,
            'completionNotes' => null,
            'assignedOfficerId' => $users['officer2']['id'],
            'daysAgo' => 6,
        ],
        [
            'title' => 'Damaged pavement near school gate',
            'description' => 'The asphalt surface has crumbled, exposing the base layer. Tricycle drivers slow down abruptly, causing near-misses.',
            'category' => 'DAMAGED_PAVEMENT',
            'priority' => 'MEDIUM',
            'latitude' => 14.5547,
            'longitude' => 121.0244,
            'addressText' => 'Ayala Ave, Makati City',
            'areaLabel' => 'Makati',
            'moderationStatus' => 'APPROVED',
            'repairStatus' => 'AWAITING_MAINTENANCE',
            'rejectionReason' => null,
            'citizenId' => $users['citizen1']['id'],
            'before' => 'pothole',
            'after' => null,
            'completionNotes' => null,
            'assignedOfficerId' => $users['officer1']['id'],
            'daysAgo' => 3,
        ],
        [
            'title' => 'Road crack widening on Ortigas flyover approach',
            'description' => 'A longitudinal crack has widened over the past month. Water enters and weakens the sub-base.',
            'category' => 'ROAD_CRACK',
            'priority' => 'HIGH',
            'latitude' => 14.5875,
            'longitude' => 121.0567,
            'addressText' => 'Ortigas Ave, Pasig City',
            'areaLabel' => 'Pasig',
            'moderationStatus' => 'APPROVED',
            'repairStatus' => 'NOT_ASSIGNED',
            'rejectionReason' => null,
            'citizenId' => $users['citizen2']['id'],
            'before' => 'crack',
            'after' => null,
            'completionNotes' => null,
            'assignedOfficerId' => null,
            'daysAgo' => 2,
        ],
        [
            'title' => 'Clogged drainage causing road damage',
            'description' => 'Leaves and debris have blocked the roadside drainage. Standing water is eroding the shoulder of the road.',
            'category' => 'DAMAGED_DRAINAGE',
            'priority' => 'MEDIUM',
            'latitude' => 14.6760,
            'longitude' => 121.0437,
            'addressText' => 'Commonwealth Ave, Quezon City',
            'areaLabel' => 'Quezon City',
            'moderationStatus' => 'PENDING_REVIEW',
            'repairStatus' => 'NOT_ASSIGNED',
            'rejectionReason' => null,
            'citizenId' => $users['citizen1']['id'],
            'before' => 'flood',
            'after' => null,
            'completionNotes' => null,
            'assignedOfficerId' => null,
            'daysAgo' => 1,
        ],
        [
            'title' => 'Sinkhole forming beside the sidewalk',
            'description' => 'A depression is forming beside the sidewalk. It looks like it could collapse and it is right next to a pedestrian crossing.',
            'category' => 'OTHER',
            'priority' => 'LOW',
            'latitude' => 14.5794,
            'longitude' => 120.9746,
            'addressText' => 'Roxas Blvd, Manila',
            'areaLabel' => 'Manila',
            'moderationStatus' => 'REJECTED',
            'rejectionReason' => 'This location is outside the jurisdiction of the reporting district. Please resubmit to the City of Manila LGU.',
            'repairStatus' => 'NOT_ASSIGNED',
            'citizenId' => $users['citizen2']['id'],
            'before' => 'crack',
            'after' => null,
            'completionNotes' => null,
            'assignedOfficerId' => null,
            'daysAgo' => 5,
        ],
    ];

    foreach ($rows as $row) {
        $createdAt = Dates::now()->modify('-' . (int) $row['daysAgo'] . ' days');

        $beforeStored = Storage::save($images[$row['before']], $row['before'] . '.png', 'image/png', 'reports/seed');
        $afterStored = $row['after'] !== null
            ? Storage::save($images[$row['after']], $row['after'] . '.png', 'image/png', 'reports/seed')
            : null;

        Db::transaction(static function () use ($row, $users, $createdAt, $beforeStored, $afterStored): void {
            $year = (int) $createdAt->format('Y');
            $referenceNo = Reference::next($year);

            $reportId = Ids::cuid();
            $moderated = $row['moderationStatus'] !== 'PENDING_REVIEW';

            Db::execute(
                'INSERT INTO `Report`
                    (`id`,`referenceNo`,`title`,`description`,`category`,`priority`,`latitude`,`longitude`,`addressText`,`areaLabel`,
                     `moderationStatus`,`rejectionReason`,`moderatedById`,`moderatedAt`,
                     `repairStatus`,`assignedOfficerId`,`assignedAt`,`completedAt`,`completionNotes`,`completionOverride`,
                     `citizenId`,`createdAt`,`updatedAt`)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                    $reportId,
                    $referenceNo,
                    $row['title'],
                    $row['description'],
                    $row['category'],
                    $row['priority'],
                    $row['latitude'],
                    $row['longitude'],
                    $row['addressText'],
                    $row['areaLabel'],
                    $row['moderationStatus'],
                    $row['rejectionReason'],
                    $moderated ? $users['admin']['id'] : null,
                    $moderated ? Dates::toDb($createdAt->modify('+3600 seconds')) : null,
                    $row['repairStatus'],
                    $row['assignedOfficerId'],
                    $row['assignedOfficerId'] !== null ? Dates::toDb($createdAt->modify('+7200 seconds')) : null,
                    $row['repairStatus'] === 'COMPLETED' ? Dates::toDb($createdAt->modify('+86400 seconds')) : null,
                    $row['completionNotes'],
                    0,
                    $row['citizenId'],
                    Dates::toDb($createdAt),
                    Dates::toDb(Dates::now()),
                ]
            );

            // BEFORE photo (always present).
            Db::execute(
                'INSERT INTO `ReportPhoto`
                    (`id`,`reportId`,`kind`,`storageKey`,`mimeType`,`sizeBytes`,`width`,`height`,`uploadedById`,`createdAt`)
                 VALUES (?,?,?,?,?,?,?,?,?,?)',
                [
                    Ids::cuid(),
                    $reportId,
                    'BEFORE',
                    $beforeStored['key'],
                    'image/png',
                    $beforeStored['sizeBytes'],
                    160,
                    120,
                    $row['citizenId'],
                    Dates::toDb($createdAt),
                ]
            );

            // AFTER photo (only for the completed report).
            if ($afterStored !== null) {
                Db::execute(
                    'INSERT INTO `ReportPhoto`
                        (`id`,`reportId`,`kind`,`storageKey`,`mimeType`,`sizeBytes`,`width`,`height`,`uploadedById`,`createdAt`)
                     VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [
                        Ids::cuid(),
                        $reportId,
                        'AFTER',
                        $afterStored['key'],
                        'image/png',
                        $afterStored['sizeBytes'],
                        160,
                        120,
                        $row['assignedOfficerId'],
                        Dates::toDb($createdAt->modify('+86400 seconds')),
                    ]
                );
            }

            Db::execute(
                'INSERT INTO `StatusHistory`
                    (`id`,`reportId`,`type`,`fromValue`,`toValue`,`note`,`actorId`,`actorRole`,`createdAt`)
                 VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    Ids::cuid(),
                    $reportId,
                    'CREATION',
                    null,
                    'PENDING_REVIEW',
                    'Report submitted by citizen.',
                    $row['citizenId'],
                    'CITIZEN',
                    Dates::toDb($createdAt),
                ]
            );

            if ($moderated) {
                Db::execute(
                    'INSERT INTO `StatusHistory`
                        (`id`,`reportId`,`type`,`fromValue`,`toValue`,`note`,`actorId`,`actorRole`,`createdAt`)
                     VALUES (?,?,?,?,?,?,?,?,?)',
                    [
                        Ids::cuid(),
                        $reportId,
                        'MODERATION',
                        'PENDING_REVIEW',
                        $row['moderationStatus'],
                        $row['moderationStatus'] === 'APPROVED'
                            ? 'Report approved.'
                            : 'Report rejected: ' . $row['rejectionReason'],
                        $users['admin']['id'],
                        'ADMIN',
                        Dates::toDb($createdAt->modify('+3600 seconds')),
                    ]
                );
            }

            if ($row['assignedOfficerId'] !== null) {
                Db::execute(
                    'INSERT INTO `Assignment`
                        (`id`,`reportId`,`officerId`,`assignedById`,`status`,`note`,`dueDate`,`createdAt`,`completedAt`)
                     VALUES (?,?,?,?,?,?,?,?,?)',
                    [
                        Ids::cuid(),
                        $reportId,
                        $row['assignedOfficerId'],
                        $users['admin']['id'],
                        $row['repairStatus'] === 'COMPLETED'
                            ? 'COMPLETED'
                            : ($row['repairStatus'] === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED'),
                        null,
                        null,
                        Dates::toDb($createdAt->modify('+7200 seconds')),
                        $row['repairStatus'] === 'COMPLETED' ? Dates::toDb($createdAt->modify('+86400 seconds')) : null,
                    ]
                );

                if ($row['repairStatus'] !== 'NOT_ASSIGNED') {
                    Db::execute(
                        'INSERT INTO `StatusHistory`
                            (`id`,`reportId`,`type`,`fromValue`,`toValue`,`note`,`actorId`,`actorRole`,`createdAt`)
                         VALUES (?,?,?,?,?,?,?,?,?)',
                        [
                            Ids::cuid(),
                            $reportId,
                            'REPAIR',
                            'AWAITING_MAINTENANCE',
                            $row['repairStatus'],
                            $row['repairStatus'] === 'COMPLETED' ? $row['completionNotes'] : null,
                            $row['assignedOfficerId'],
                            'MAINTENANCE_OFFICER',
                            Dates::toDb($createdAt->modify('+86400 seconds')),
                        ]
                    );
                }
            }
        });
    }

    echo 'Seeded ' . count($rows) . ' reports.' . PHP_EOL;
}

function seed_main(): void
{
    echo 'Seeding RoadWatch…' . PHP_EOL;
    $users = seed_users();
    seed_reports($users);

    echo PHP_EOL . 'Demo accounts (change these in production):' . PHP_EOL;
    echo '  ADMIN                admin@roadwatch.gov       ' . PHP_EOL;
    echo '  MAINTENANCE OFFICER  officer1@roadwatch.gov    ' . PHP_EOL;
    echo '  MAINTENANCE OFFICER  officer2@roadwatch.gov    ' . PHP_EOL;
    echo '  CITIZEN              citizen@example.com       ' . PHP_EOL;
    echo '  CITIZEN              citizen2@example.com      ' . PHP_EOL;
}

try {
    seed_main();
} catch (\Throwable $e) {
    fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . PHP_EOL);
    fwrite(STDERR, $e->getFile() . ':' . $e->getLine() . PHP_EOL);
    if (!$e instanceof \PDOException) {
        fwrite(STDERR, $e->getTraceAsString() . PHP_EOL);
    }
    exit(1);
}
