import { injectable } from 'tsyringe';
import * as usersDb from '../../../services/db/users/users.db';

@injectable()
export class GetFavoritesUseCase {
  public async execute(userId: number): Promise<{ favorites: unknown[] }> {
    const favorites = await usersDb.getFavorites(userId);
    return { favorites };
  }
}
