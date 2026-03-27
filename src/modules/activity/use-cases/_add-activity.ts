import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import prisma from '../../../services/prisma/index';

interface AddActivityDTO {
  action: 'checkin' | 'favorite' | 'list_add';
  beerId: string;
  review?: string;
  rating?: number;
  location?: string;
}

@injectable()
export class AddActivityUseCase {
  public async execute(userId: number, data: AddActivityDTO) {
    if (!['checkin', 'favorite', 'list_add'].includes(data.action)) {
      throw new AppError(400, 'Invalid action type');
    }

    const beer = await prisma.beer.findUnique({ where: { id: data.beerId } });
    if (!beer) {
      throw new AppError(404, 'Beer not found');
    }

    const activity = await prisma.userActivity.create({
      data: {
        userId,
        action: data.action,
        beerId: data.beerId,
        review: data.review,
        rating: data.rating,
        location: data.location
      },
      include: {
        user: { select: { username: true } },
        beer: { select: { beerName: true, brewery: true } },
        _count: { select: { toasts: true } }
      }
    });

    return {
      id: activity.id,
      user: activity.user.username,
      action: activity.action,
      beer: activity.beer.beerName,
      brewery: activity.beer.brewery,
      review: activity.review,
      time: activity.createdAt.toISOString(),
      location: activity.location,
      toasts: activity._count.toasts
    };
  }
}
