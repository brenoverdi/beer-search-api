import prisma from '../../prisma/index';

// ── Lists ────────────────────────────────────────────────────────────────────

export const getLists = async (userId: number) =>
  prisma.userList.findMany({
    where: { userId },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });

export const getListById = async (id: number) =>
  prisma.userList.findUnique({ where: { id } });

export const getListWithOwner = async (id: number, userId: number) =>
  prisma.userList.findFirst({ where: { id, userId } });

export const createList = async (userId: number, name: string, description: string | null, isPublic: boolean) =>
  prisma.userList.create({ data: { userId, name, description, isPublic } });

export const updateList = async (
  id: number,
  userId: number,
  data: { name?: string; description?: string | null; isPublic?: boolean },
) =>
  prisma.userList.updateMany({ where: { id, userId }, data });

export const deleteList = async (id: number, userId: number) =>
  prisma.userList.deleteMany({ where: { id, userId } });

// ── List items ───────────────────────────────────────────────────────────────

export const getListItems = async (listId: number) =>
  prisma.listItem.findMany({
    where: { listId },
    include: { beer: true },
    orderBy: { addedAt: 'asc' },
  });

export const addItem = async (listId: number, beerId: string, notes: string | null) =>
  prisma.listItem.create({ data: { listId, beerId, notes }, include: { beer: true } });

export const removeItem = async (listId: number, beerId: string) =>
  prisma.listItem.deleteMany({ where: { listId, beerId } });
