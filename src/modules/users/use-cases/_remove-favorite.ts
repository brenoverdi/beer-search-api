import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as usersDb from '../../../services/db/users/users.db';

@injectable()
export class RemoveFavoriteUseCase {
  public async execute(userId: number, beerId: string): Promise<{ message: string }> {
    const deleted = await usersDb.removeFavorite(userId, beerId);
    if ((deleted as { count: number }).count === 0) throw new AppError(404, 'Favorite not found');
    return { message: 'Removed from favorites' };
  }
}
