/**
 * RoadWatch seed data.
 *   npm run seed
 *
 * Creates demo accounts (see docs/DEMO_ACCOUNTS or the console output),
 * maintenance officers, and a realistic spread of reports across every
 * moderation/repair status. Safe to re-run: users are upserted and reports are
 * only seeded when the table is empty.
 */
import { PrismaClient, type Category, type ModerationStatus, type Priority, type RepairStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getStorage } from '../src/services/storage';
import { nextReferenceNo } from '../src/utils/reference';

const prisma = new PrismaClient();

const IMG_POTHOLE =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB0UlEQVR42u3cMU4DMRCG0c1oz5aKG6SiTcVRqNJS5QZUuZypoEAIVggR7z/vqyhIhObJBhF7D2OMRbmVEQDWjls/vjqdHo0jpuv1xQq2RQuwAAuwAAuwAAMWYAEWYAEWYAEGLMACLMACLMACLMCABViAtUxzdWXabrfXLd92PD7g3AfwRtHvX8V7OuDfuf74bs2l1zzaL9+8LfMaTIv5nsD/RtuceW1C25a5uulO+JPkAM820w7G1Xya8cZljtnGZYLZxj5s8Du4x+JIXcRlatnGtmhbtADH7Hh5u7QVbAULsAALsABrIuA9HpnIO+ZhBVvBApyx40UewytTy74AYYu2RTdYHMFnpMsEs0/AV/M5xt9vqM7T7HB7pdrOtMndpPVek73j2Qm3C2OZ3Q+OZXbDP5bZMzqm+5v2T6Q9ZWfexyh9svGcrPAHoZHzYYMAAxZgARZgARZgvXe5PC+7/keHNloCDrcEHG4JOMHyfH4C3NQScLgl4HBLwOGWgMMtAYdbtgPuZpkMzDIHmGUOMMscYJY5wCxzgFnmALPMAWaZA8zSFs0yEZhlDjDLJfhcNF0H3wVYgAVYgAUYsAALsAALsAALcOsOYwxTsIIFWFP2Bo+Dsw0CMb0JAAAAAElFTkSuQmCC';
const IMG_FLOOD =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB1klEQVR42u3csU0DQRCG0fPoKqIJOiBwB0R04MAdENGBAzqgCVpaIggQghNCeO+f90UE2ELztAvCu3cYYyzKrYwAsHbc+vHV7cOTccT08nhvBduiBViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMBaprm6Mm2vl9OWb7s5nnHuA3ij6Pev4j0d8O9cf3y35tJrHu2Xb96WeQ2mxXxN4H+jbc68NqFty1zddCf8SXKAZ5tpB+NqPs144zLHbOMywWxjHzb4HdxjcaQu4jK1bGNbtC1agGN2vLxd2gq2ggVYgAVYgDUR8B6PTOQd87CCrWABztjxIo/hlallX4CwRduiGyyO4DPSZYLZJ+Cr+Rzj7zdU52l2uL1SbWfa5G7Seq3JXvHshNuFsczuB8cyu+Efy+wZHdP9Tfsn0p6yM+9jlD7ZeE5W+IPQyPmwQYABC7AAC7AAC7Deez4fl13/o0MbLQGHWwIOtwScYHl3ugBuagk43BJwuCXgcEvA4ZaAwy3bAXezTAZmmQPMMgeYZQ4wyxxgljnALHOAWeYAs8wBZmmLZpkIzDIHmOUSfC6aroPvAizAAizAAgxYgAVYgAVYgAW4dYcxhilYwQKsKXsD7E+zQ8VnY4cAAAAASUVORK5CYII=';
const IMG_AFTER =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAByklEQVR42u3cQU7DMBRF0dTKUrMDJukKmgk7yF7NCAYI0ahCxHn/3BEDWqF/ZIOonVvvfVJuzQgA68LNX1/d3+/GEdPj7WEF26IFWIAFWIAFWIABC7AAC7AAC7AAAxZgARZgARZgARZgwAIswJqGuboybPu2H/m2ZV1wXgP4oOjvr+I9HPBrrk/frbj0nEf745uXZZ6DaTGfCfxvtMWZ5yK0ZZlbNd0Bf5Ic4NFmWsG4FZ9mvHEzx2zjZoLZxj5s8Du4xuJIXcTN1LKNbdG2aAGO2fHydmkr2AoWYAEWYAHWQMBXPDKRd8zDCraCBThjx4s8htdMLfsChC3aFl1gcQSfkW4mmH0CvhWfY/z9hlZ5mhVur7SyMy1yN2k+a7Innp1wuzCW2f3gWGY3/GOZPaNjuL9p/0TaU3bGfYzSNxvPyQp/EBo5HzYIMGABFmABFmAB1mfrsk6X/keHDloCDrcEHG4JOMFy2zfARS0Bh1sCDrcEHG4JONwScLhlOeBqlsnALHOAWeYAs8wBZpkDzDIHmGUOMMscYJY5wCxt0SwTgVnmALOcgs9F03XwXYAFWIAFWIABC7AAC7AAC7AAl+7WezcFK1iANWQfHPSzda60kiIAAAAASUVORK5CYII=';
const IMG_CRACK =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAB1UlEQVR42u3cIUtEQRSG4buH++OMZsFoEyxmg9ki2IyC2ei/G5MGEV1EvHO/87zJ4C5yHmYUd+YexhiLcisjAKwdt358dXVxbhwx3T8+WcG2aAEWYAEWYAEWYMACLMACLMACLMCABViABViABViABRiwAAuwlmmurkzb88vrMd92dnqCcx/AR4p+/yre0wH/zvXHd2suvebRfvnmbZnXYFrMWwL/G21z5rUJbVvm6qY74U+SAzzbTDsYV/NpxhuXOWYblwlmG/uwwe/gHosjdRGXqWUb26Jt0QIcs+Pl7dJWsBUswAIswAKsiYD3eGQi75iHFWwFC3DGjhd5DK9MLfsChC3aFt1gcQSfkS4TzD4BX83nGH+/oTpPs8PtlWo70yZ3k9atJrvh2Qm3C2OZ3Q+OZXbDP5bZMzqm+5v2T6Q9ZWfexyh9svGcrPAHoZHzYYMAAxZgARZgARZgvXd797Ds+h8dOtIScLgl4HBLwAmWN9eXgJtaAg63BBxuCTjcEnC4JeBwy3bA3SyTgVnmALPMAWaZA8wyB5hlDjDLHGCWOcAsc4BZ2qJZJgKzzAFmuQSfi6br4LsAC7AAC7AAAxZgARZgARZgAW7dYYxhClawAGvK3gCy8rMnVHsz1QAAAABJRU5ErkJggg==';

const IMAGES = {
  pothole: Buffer.from(IMG_POTHOLE, 'base64'),
  flood: Buffer.from(IMG_FLOOD, 'base64'),
  after: Buffer.from(IMG_AFTER, 'base64'),
  crack: Buffer.from(IMG_CRACK, 'base64'),
};

async function seedUsers() {
  const [adminHash, officerHash, citizenHash] = await Promise.all([
    bcrypt.hash('Admin@12345', 10),
    bcrypt.hash('Officer@12345', 10),
    bcrypt.hash('Citizen@12345', 10),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@roadwatch.gov' },
    update: {},
    create: {
      fullName: 'Maria Santos',
      email: 'admin@roadwatch.gov',
      phone: '+63 917 000 0001',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  const officer1 = await prisma.user.upsert({
    where: { email: 'officer1@roadwatch.gov' },
    update: {},
    create: {
      fullName: 'Miguel Reyes',
      email: 'officer1@roadwatch.gov',
      phone: '+63 917 000 0002',
      passwordHash: officerHash,
      role: 'MAINTENANCE_OFFICER',
    },
  });

  const officer2 = await prisma.user.upsert({
    where: { email: 'officer2@roadwatch.gov' },
    update: {},
    create: {
      fullName: 'Ana Dela Cruz',
      email: 'officer2@roadwatch.gov',
      phone: '+63 917 000 0003',
      passwordHash: officerHash,
      role: 'MAINTENANCE_OFFICER',
    },
  });

  const citizen1 = await prisma.user.upsert({
    where: { email: 'citizen@example.com' },
    update: {},
    create: {
      fullName: 'Juan Dela Cruz',
      email: 'citizen@example.com',
      phone: '+63 917 000 0004',
      passwordHash: citizenHash,
      role: 'CITIZEN',
    },
  });

  const citizen2 = await prisma.user.upsert({
    where: { email: 'citizen2@example.com' },
    update: {},
    create: {
      fullName: 'Liza Ramos',
      email: 'citizen2@example.com',
      phone: '+63 917 000 0005',
      passwordHash: citizenHash,
      role: 'CITIZEN',
    },
  });

  return { admin, officer1, officer2, citizen1, citizen2 };
}

interface SeedReport {
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  latitude: number;
  longitude: number;
  addressText: string;
  areaLabel: string;
  moderationStatus: ModerationStatus;
  repairStatus: RepairStatus;
  rejectionReason?: string;
  citizenId: string;
  before: keyof typeof IMAGES;
  after?: keyof typeof IMAGES;
  completionNotes?: string;
  assignedOfficerId?: string;
  daysAgo: number;
}

async function seedReports(users: Awaited<ReturnType<typeof seedUsers>>) {
  const existing = await prisma.report.count();
  if (existing > 0) {
    console.log(`Skipping report seeding — ${existing} report(s) already exist.`);
    return;
  }

  const storage = getStorage();

  const rows: SeedReport[] = [
    {
      title: 'Large pothole on Aurora Boulevard',
      description:
        'A deep pothole has formed in the middle lane near the intersection. It is a hazard for motorcycles, especially at night.',
      category: 'POTHOLE',
      priority: 'HIGH',
      latitude: 14.6182,
      longitude: 121.0218,
      addressText: 'Aurora Blvd, Quezon City, Metro Manila',
      areaLabel: 'Quezon City',
      moderationStatus: 'APPROVED',
      repairStatus: 'COMPLETED',
      citizenId: users.citizen1.id,
      before: 'pothole',
      after: 'after',
      completionNotes: 'Pothole filled and levelled with hot-mix asphalt. Area compacted and left clear for traffic.',
      assignedOfficerId: users.officer1.id,
      daysAgo: 12,
    },
    {
      title: 'Flooding along Espana Boulevard',
      description:
        'Knee-deep flooding after heavy rain. Drainage appears clogged and water is not receding, affecting jeepney routes.',
      category: 'FLOODING',
      priority: 'URGENT',
      latitude: 14.6091,
      longitude: 120.9891,
      addressText: 'Espana Blvd, Sampaloc, Manila',
      areaLabel: 'Manila',
      moderationStatus: 'APPROVED',
      repairStatus: 'IN_PROGRESS',
      citizenId: users.citizen2.id,
      before: 'flood',
      assignedOfficerId: users.officer2.id,
      daysAgo: 6,
    },
    {
      title: 'Damaged pavement near school gate',
      description:
        'The asphalt surface has crumbled, exposing the base layer. Tricycle drivers slow down abruptly, causing near-misses.',
      category: 'DAMAGED_PAVEMENT',
      priority: 'MEDIUM',
      latitude: 14.5547,
      longitude: 121.0244,
      addressText: 'Ayala Ave, Makati City',
      areaLabel: 'Makati',
      moderationStatus: 'APPROVED',
      repairStatus: 'AWAITING_MAINTENANCE',
      citizenId: users.citizen1.id,
      before: 'pothole',
      assignedOfficerId: users.officer1.id,
      daysAgo: 3,
    },
    {
      title: 'Road crack widening on Ortigas flyover approach',
      description: 'A longitudinal crack has widened over the past month. Water enters and weakens the sub-base.',
      category: 'ROAD_CRACK',
      priority: 'HIGH',
      latitude: 14.5875,
      longitude: 121.0567,
      addressText: 'Ortigas Ave, Pasig City',
      areaLabel: 'Pasig',
      moderationStatus: 'APPROVED',
      repairStatus: 'NOT_ASSIGNED',
      citizenId: users.citizen2.id,
      before: 'crack',
      daysAgo: 2,
    },
    {
      title: 'Clogged drainage causing road damage',
      description:
        'Leaves and debris have blocked the roadside drainage. Standing water is eroding the shoulder of the road.',
      category: 'DAMAGED_DRAINAGE',
      priority: 'MEDIUM',
      latitude: 14.6760,
      longitude: 121.0437,
      addressText: 'Commonwealth Ave, Quezon City',
      areaLabel: 'Quezon City',
      moderationStatus: 'PENDING_REVIEW',
      repairStatus: 'NOT_ASSIGNED',
      citizenId: users.citizen1.id,
      before: 'flood',
      daysAgo: 1,
    },
    {
      title: 'Sinkhole forming beside the sidewalk',
      description:
        'A depression is forming beside the sidewalk. It looks like it could collapse and it is right next to a pedestrian crossing.',
      category: 'OTHER',
      priority: 'LOW',
      latitude: 14.5794,
      longitude: 120.9746,
      addressText: 'Roxas Blvd, Manila',
      areaLabel: 'Manila',
      moderationStatus: 'REJECTED',
      rejectionReason: 'This location is outside the jurisdiction of the reporting district. Please resubmit to the City of Manila LGU.',
      repairStatus: 'NOT_ASSIGNED',
      citizenId: users.citizen2.id,
      before: 'crack',
      daysAgo: 5,
    },
  ];

  for (const row of rows) {
    const createdAt = new Date(Date.now() - row.daysAgo * 86_400_000);

    const beforeStored = await storage.save(IMAGES[row.before], {
      originalName: `${row.before}.png`,
      mimeType: 'image/png',
      folder: 'reports/seed',
    });
    const afterStored = row.after
      ? await storage.save(IMAGES[row.after], {
          originalName: `${row.after}.png`,
          mimeType: 'image/png',
          folder: 'reports/seed',
        })
      : null;

    await prisma.$transaction(async (tx) => {
      const referenceNo = await nextReferenceNo(tx, createdAt.getFullYear());

      const report = await tx.report.create({
        data: {
          referenceNo,
          title: row.title,
          description: row.description,
          category: row.category,
          priority: row.priority,
          latitude: row.latitude,
          longitude: row.longitude,
          addressText: row.addressText,
          areaLabel: row.areaLabel,
          moderationStatus: row.moderationStatus,
          rejectionReason: row.rejectionReason ?? null,
          moderatedById: row.moderationStatus === 'PENDING_REVIEW' ? null : users.admin.id,
          moderatedAt: row.moderationStatus === 'PENDING_REVIEW' ? null : new Date(createdAt.getTime() + 3_600_000),
          repairStatus: row.repairStatus,
          citizenId: row.citizenId,
          assignedOfficerId: row.assignedOfficerId ?? null,
          assignedAt: row.assignedOfficerId ? new Date(createdAt.getTime() + 7_200_000) : null,
          completedAt: row.repairStatus === 'COMPLETED' ? new Date(createdAt.getTime() + 86_400_000) : null,
          completionNotes: row.completionNotes ?? null,
          createdAt,
          photos: {
            create: [
              {
                kind: 'BEFORE',
                storageKey: beforeStored.key,
                mimeType: 'image/png',
                sizeBytes: beforeStored.sizeBytes,
                width: 160,
                height: 120,
                uploadedById: row.citizenId,
                createdAt,
              },
              ...(afterStored
                ? [
                    {
                      kind: 'AFTER' as const,
                      storageKey: afterStored.key,
                      mimeType: 'image/png',
                      sizeBytes: afterStored.sizeBytes,
                      width: 160,
                      height: 120,
                      uploadedById: row.assignedOfficerId!,
                      createdAt: new Date(createdAt.getTime() + 86_400_000),
                    },
                  ]
                : []),
            ],
          },
        },
      });

      await tx.statusHistory.create({
        data: { reportId: report.id, type: 'CREATION', toValue: 'PENDING_REVIEW', note: 'Report submitted by citizen.', actorId: row.citizenId, actorRole: 'CITIZEN', createdAt },
      });

      if (row.moderationStatus !== 'PENDING_REVIEW') {
        await tx.statusHistory.create({
          data: {
            reportId: report.id,
            type: 'MODERATION',
            fromValue: 'PENDING_REVIEW',
            toValue: row.moderationStatus,
            note: row.moderationStatus === 'APPROVED' ? 'Report approved.' : `Report rejected: ${row.rejectionReason}`,
            actorId: users.admin.id,
            actorRole: 'ADMIN',
            createdAt: new Date(createdAt.getTime() + 3_600_000),
          },
        });
      }

      if (row.assignedOfficerId) {
        await tx.assignment.create({
          data: {
            reportId: report.id,
            officerId: row.assignedOfficerId,
            assignedById: users.admin.id,
            status: row.repairStatus === 'COMPLETED' ? 'COMPLETED' : row.repairStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED',
            createdAt: new Date(createdAt.getTime() + 7_200_000),
            completedAt: row.repairStatus === 'COMPLETED' ? new Date(createdAt.getTime() + 86_400_000) : null,
          },
        });

        if (row.repairStatus !== 'NOT_ASSIGNED') {
          await tx.statusHistory.create({
            data: {
              reportId: report.id,
              type: 'REPAIR',
              fromValue: 'AWAITING_MAINTENANCE',
              toValue: row.repairStatus,
              note: row.repairStatus === 'COMPLETED' ? row.completionNotes ?? null : null,
              actorId: row.assignedOfficerId,
              actorRole: 'MAINTENANCE_OFFICER',
              createdAt: new Date(createdAt.getTime() + 86_400_000),
            },
          });
        }
      }
    });
  }

  console.log(`Seeded ${rows.length} reports.`);
}

async function main() {
  console.log('Seeding RoadWatch…');
  const users = await seedUsers();
  await seedReports(users);

  console.log('\nDemo accounts (change these in production):');
  console.log('  ADMIN                admin@roadwatch.gov       / Admin@12345');
  console.log('  MAINTENANCE OFFICER  officer1@roadwatch.gov    / Officer@12345');
  console.log('  MAINTENANCE OFFICER  officer2@roadwatch.gov    / Officer@12345');
  console.log('  CITIZEN              citizen@example.com       / Citizen@12345');
  console.log('  CITIZEN              citizen2@example.com      / Citizen@12345');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
