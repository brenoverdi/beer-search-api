import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as usersDb from '../../../services/db/users/users.db';
import prisma from '../../../services/prisma/index';
import { UserProfile } from '../users.model';

@injectable()
export class GetProfileUseCase {
  public async execute(userId: number): Promise<{ user: UserProfile }> {
    const [user, favCount] = await Promise.all([
      usersDb.getUserById(userId),
      prisma.userFavorite.count({ where: { userId } }),
    ]);

    if (!user) throw new AppError(404, 'User not found');

    return { user: { ...user, favorites_count: favCount } };
  }
}
