import prisma from '../../prisma/index';
import { Prisma } from '@prisma/client';

// ── Festival queries ──────────────────────────────────────────────────────────

export const findAllFestivals = async (filters?: {
  continent?: string;
  fromDate?: Date;
}) => {
  const where: Prisma.FestivalWhereInput = {};
  
  if (filters?.continent && filters.continent !== 'all') {
    where.continent = filters.continent;
  }
  
  if (filters?.fromDate) {
    where.endDate = { gte: filters.fromDate };
  }
  
  return prisma.festival.findMany({
    where,
    orderBy: { startDate: 'asc' },
  });
};

export const findFestivalById = async (id: number) => {
  return prisma.festival.findUnique({ where: { id } });
};

export const createFestival = async (data: Prisma.FestivalCreateInput) => {
  return prisma.festival.create({ data });
};

export const updateFestival = async (id: number, data: Prisma.FestivalUpdateInput) => {
  return prisma.festival.update({ where: { id }, data });
};

export const deleteFestival = async (id: number) => {
  return prisma.festival.delete({ where: { id } });
};

export const countFestivals = async () => {
  return prisma.festival.count();
};

// ── Itinerary queries ─────────────────────────────────────────────────────────

export const findUserItineraries = async (userId: number) => {
  return prisma.userItinerary.findMany({
    where: { userId },
    include: { festival: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const findItineraryById = async (id: number) => {
  return prisma.userItinerary.findUnique({
    where: { id },
    include: { festival: true, user: { select: { id: true, username: true } } },
  });
};

export const createItinerary = async (data: {
  userId: number;
  festivalId: number;
  arrivalDate: Date;
  departureDate: Date;
  generatedPlan: Prisma.InputJsonValue;
}) => {
  return prisma.userItinerary.create({
    data,
    include: { festival: true },
  });
};

export const deleteItinerary = async (id: number) => {
  return prisma.userItinerary.delete({ where: { id } });
};
