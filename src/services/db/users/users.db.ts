import prisma from '../../prisma/index';

// ── Profile ──────────────────────────────────────────────────────────────────

export const getUserById = async (id: number) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, emailVerified: true, isPremium: true, searchesRemaining: true, favoriteStyles: true, createdAt: true },
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

// ── Limits & Premium ──────────────────────────────────────────────────────────

export const upgradeToPremium = async (userId: number) =>
  prisma.user.update({
    where: { id: userId },
    data: { isPremium: true, searchesRemaining: 999999 }
  });

export const decrementSearches = async (userId: number) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && !user.isPremium && user.searchesRemaining > 0) {
    return prisma.user.update({
      where: { id: userId },
      data: { searchesRemaining: { decrement: 1 } }
    });
  }
  return user;
};
