import 'dotenv/config';
import 'reflect-metadata';

import api from './api';
import prisma from './services/prisma/index';

const PORT = Number(process.env.PORT) || 3001;

const start = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('📦 PostgreSQL connected via Prisma');

    api.listen(PORT, () => {
      console.log(`🍺 Beer Search API running on http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received. Shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

void start();
