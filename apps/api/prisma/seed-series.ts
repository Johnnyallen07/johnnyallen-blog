import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    // 1. Ensure User exists
    const user = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Admin User',
            password: 'password123', // In real app, this should be hashed
        },
    });
    console.log('User ID:', user.id);

    // 2. Clear existing Series data (Optional: user asked to "re-insert")
    // We'll delete Series, which cascades to SeriesItems.
    console.log('Cleaning up old series...');
    await prisma.series.deleteMany({});

    // 3. Create Category
    const category = await prisma.category.upsert({
        where: { slug: 'game' },
        update: {},
        create: {
            name: 'Game Development',
            slug: 'game',
            description: 'Game dev tutorials and series',
            icon: 'Gamepad2',
        },
    });
    console.log('Category ID:', category.id);

    // 4. Create Series
    const series = await prisma.series.create({
        data: {
            title: 'Video Coding 专栏',
            slug: 'video-coding-series',
            emoji: '🎥',
            description: 'A series about video coding.',
            categoryId: category.id,
            authorId: user.id,
            published: true,
        },
    });
    console.log('Series ID:', series.id);

    // 5. Create Items
    // Root Folder "Basics"
    const basicsFolder = await prisma.seriesItem.create({
        data: {
            seriesId: series.id,
            title: 'Basics',
            parentId: null,
            order: 0,
        },
    });

    // Post 1 inside Basics
    const post1 = await prisma.post.create({
        data: {
            title: 'Introduction to Video',
            slug: 'video-intro',
            content: '# Introduction\n\nWelcome to video coding.',
            authorId: user.id,
            categoryId: category.id,
            published: true,
        },
    });

    await prisma.seriesItem.create({
        data: {
            seriesId: series.id,
            postId: post1.id,
            parentId: basicsFolder.id,
            order: 0,
        },
    });

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
