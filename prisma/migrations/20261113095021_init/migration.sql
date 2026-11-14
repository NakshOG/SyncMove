-- CreateTable
CREATE TABLE `Profile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `imageUrl` TEXT NOT NULL,
    `email` TEXT NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Profile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Server` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `imageURL` TEXT NOT NULL,
    `inviteCode` VARCHAR(191) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Server_inviteCode_key`(`inviteCode`),
    INDEX `Server_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Member` (
    `id` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'MODERATOR', 'GUEST') NOT NULL DEFAULT 'GUEST',
    `serverId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,

    INDEX `Member_serverId_idx`(`serverId`),
    INDEX `Member_profileId_idx`(`profileId`),
    UNIQUE INDEX `Member_profileId_serverId_key`(`profileId`, `serverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Channel` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('TEXT', 'AUDIO', 'VIDEO') NOT NULL DEFAULT 'TEXT',
    `serverId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,

    INDEX `Channel_serverId_idx`(`serverId`),
    INDEX `Channel_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `fileUrl` TEXT NULL,
    `encrypted` BOOLEAN NOT NULL DEFAULT false,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `memberId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,

    INDEX `Message_memberId_idx`(`memberId`),
    INDEX `Message_channelId_idx`(`channelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `memberOneId` VARCHAR(191) NOT NULL,
    `memberTwoId` VARCHAR(191) NOT NULL,

    INDEX `Conversation_memberOneId_idx`(`memberOneId`),
    INDEX `Conversation_memberTwoId_idx`(`memberTwoId`),
    UNIQUE INDEX `Conversation_memberOneId_memberTwoId_key`(`memberOneId`, `memberTwoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DirectMessage` (
    `id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `fileUrl` TEXT NULL,
    `encrypted` BOOLEAN NOT NULL DEFAULT false,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `memberId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL,

    INDEX `DirectMessage_memberId_idx`(`memberId`),
    INDEX `DirectMessage_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallSignal` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `payload` TEXT NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CallSignal_roomId_CreatedAt_idx`(`roomId`, `CreatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KeyBundle` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `identityKey` TEXT NOT NULL,
    `signedPreKey` TEXT NOT NULL,
    `signature` TEXT NOT NULL,
    `oneTimePreKeyId` VARCHAR(191) NULL,
    `oneTimePreKey` TEXT NULL,
    `created` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KeyBundle_userId_key`(`userId`),
    INDEX `KeyBundle_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Server` ADD CONSTRAINT `Server_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Channel` ADD CONSTRAINT `Channel_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Channel` ADD CONSTRAINT `Channel_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `Channel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_memberOneId_fkey` FOREIGN KEY (`memberOneId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_memberTwoId_fkey` FOREIGN KEY (`memberTwoId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DirectMessage` ADD CONSTRAINT `DirectMessage_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DirectMessage` ADD CONSTRAINT `DirectMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
