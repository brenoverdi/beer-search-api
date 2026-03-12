import prisma from '../../prisma/index';

// ── Profile ──────────────────────────────────────────────────────────────────

export const getUserById = async (id: number) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, emailVerified: true, createdAt: true },
  });

// ── Favorites ────────────────────────────────────────────────────────────────

export const getFavorites = async (userId: number) =>
  prisma.userFavorite.findMany({
    where: { userId },
    include: { beer: true },
    orderBy: { addedAt: 'desc' },
  });

export const findFavorite = async (userId: number, beerId: string) =>
  prisma.userFavorite.findUnique({ where: { userId_beerId: { userId, beerId } } });

export const addFavorite = async (userId: number, beerId: string) =>
  prisma.userFavorite.create({ data: { userId, beerId }, include: { beer: true } });

export const removeFavorite = async (userId: number, beerId: string) =>
  prisma.userFavorite.deleteMany({ where: { userId, beerId } });

// ── Search History ───────────────────────────────────────────────────────────

export const getSearchHistory = async (userId: number, limit = 20) =>
  prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

export const getBeerById = async (id: string) =>
  prisma.beer.findUnique({ where: { id } });
