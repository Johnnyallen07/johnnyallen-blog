import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { id: 'user-123-456' },
    });
    console.log('User found:', user);

    const allUsers = await prisma.user.findMany();
    console.log('All users:', allUsers);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
