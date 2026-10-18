-- ===========================================================================
--  RoadWatch — database schema (MySQL 8 / MariaDB compatible)
-- ===========================================================================
--  Mirrors the original Prisma schema. Table and column names keep their
--  PascalCase form so existing data created by Prisma remains valid.
--  All statements are idempotent: running this again is safe.
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
--  Users & auth
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `User` (
  `id` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `role` ENUM('CITIZEN','MAINTENANCE_OFFICER','ADMIN') NOT NULL DEFAULT 'CITIZEN',
  `status` ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `avatarKey` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  KEY `User_role_idx` (`role`),
  KEY `User_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RefreshToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `userAgent` VARCHAR(191) NULL,
  `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `RefreshToken_tokenHash_key` (`tokenHash`),
  KEY `RefreshToken_userId_idx` (`userId`),
  KEY `RefreshToken_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Report` (
  `id` VARCHAR(191) NOT NULL,
  `referenceNo` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `category` ENUM('POTHOLE','DAMAGED_PAVEMENT','ROAD_CRACK','FLOODING','DAMAGED_DRAINAGE','ROAD_OBSTRUCTION','OTHER') NOT NULL,
  `categoryOther` VARCHAR(300) NULL,
  `priority` ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `addressText` VARCHAR(191) NULL,
  `areaLabel` VARCHAR(191) NULL,
  `moderationStatus` ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `rejectionReason` TEXT NULL,
  `moderatedById` VARCHAR(191) NULL,
  `moderatedAt` DATETIME(3) NULL,
  `repairStatus` ENUM('NOT_ASSIGNED','AWAITING_MAINTENANCE','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_ASSIGNED',
  `assignedOfficerId` VARCHAR(191) NULL,
  `assignedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `completionNotes` TEXT NULL,
  `completionOverride` TINYINT(1) NOT NULL DEFAULT 0,
  `citizenId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Report_referenceNo_key` (`referenceNo`),
  KEY `Report_moderationStatus_idx` (`moderationStatus`),
  KEY `Report_repairStatus_idx` (`repairStatus`),
  KEY `Report_category_idx` (`category`),
  KEY `Report_citizenId_idx` (`citizenId`),
  KEY `Report_assignedOfficerId_idx` (`assignedOfficerId`),
  KEY `Report_latitude_longitude_idx` (`latitude`, `longitude`),
  KEY `Report_createdAt_idx` (`createdAt`),
  CONSTRAINT `Report_citizenId_fkey` FOREIGN KEY (`citizenId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Report_moderatedById_fkey` FOREIGN KEY (`moderatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Report_assignedOfficerId_fkey` FOREIGN KEY (`assignedOfficerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ReportPhoto` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `kind` ENUM('BEFORE','PROGRESS','AFTER') NOT NULL DEFAULT 'BEFORE',
  `storageKey` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` INT NOT NULL,
  `width` INT NULL,
  `height` INT NULL,
  `blurData` TEXT NULL,
  `caption` VARCHAR(191) NULL,
  `uploadedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ReportPhoto_reportId_idx` (`reportId`),
  KEY `ReportPhoto_kind_idx` (`kind`),
  CONSTRAINT `ReportPhoto_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ReportPhoto_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Assignment` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `assignedById` VARCHAR(191) NOT NULL,
  `status` ENUM('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ASSIGNED',
  `note` TEXT NULL,
  `dueDate` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `Assignment_reportId_idx` (`reportId`),
  KEY `Assignment_officerId_idx` (`officerId`),
  KEY `Assignment_status_idx` (`status`),
  CONSTRAINT `Assignment_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Assignment_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Assignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StatusHistory` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `type` ENUM('CREATION','MODERATION','ASSIGNMENT','REPAIR') NOT NULL,
  `fromValue` VARCHAR(191) NULL,
  `toValue` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `actorId` VARCHAR(191) NULL,
  `actorRole` ENUM('CITIZEN','MAINTENANCE_OFFICER','ADMIN') NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `StatusHistory_reportId_idx` (`reportId`),
  KEY `StatusHistory_type_idx` (`type`),
  KEY `StatusHistory_createdAt_idx` (`createdAt`),
  CONSTRAINT `StatusHistory_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StatusHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `actorRole` ENUM('CITIZEN','MAINTENANCE_OFFICER','ADMIN') NULL,
  `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `AuditLog_actorId_idx` (`actorId`),
  KEY `AuditLog_action_idx` (`action`),
  KEY `AuditLog_entityType_entityId_idx` (`entityType`, `entityId`),
  KEY `AuditLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Optional image processing (future-ready, stored separately)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ImageAnalysisResult` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `photoId` VARCHAR(191) NULL,
  `provider` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING','COMPLETED','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `result` JSON NULL,
  `confidence` DOUBLE NULL,
  `error` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ImageAnalysisResult_reportId_idx` (`reportId`),
  KEY `ImageAnalysisResult_photoId_idx` (`photoId`),
  KEY `ImageAnalysisResult_status_idx` (`status`),
  CONSTRAINT `ImageAnalysisResult_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ImageAnalysisResult_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `ReportPhoto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ImageAnalysisResult_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Reference-number sequence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ReferenceCounter` (
  `year` INT NOT NULL,
  `value` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
