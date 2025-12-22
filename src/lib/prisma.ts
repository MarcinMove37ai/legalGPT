// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  // Upewnij się, że masz .env w głównym katalogu
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found. Available env vars:', Object.keys(process.env).filter(key =>
      key.includes('DATABASE') || key.includes('POSTGRES') || key.includes('DB')
    ));
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('✅ Creating Prisma Client with DATABASE_URL');

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    },
    // Logowanie tylko w trybie developerskim
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}