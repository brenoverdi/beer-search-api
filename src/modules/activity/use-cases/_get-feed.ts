import { injectable } from 'tsyringe';
import prisma from '../../../services/prisma/index';

@injectable()
export class GetFeedUseCase {
  public async execute(limit = 20) {
    const activities = await prisma.userActivity.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true } },
        beer: { select: { beerName: true, brewery: true, style: true } },
        _count: { select: { toasts: true } }
      }
    });

    return activities.map((a: any) => ({
      id: a.id,
      user: a.user.username,
      action: a.action,
      beer: a.beer.beerName,
      brewery: a.beer.brewery,
      review: a.review,
      time: a.createdAt.toISOString(),
      location: a.location,
      toasts: a._count.toasts
    }));
  }
}
