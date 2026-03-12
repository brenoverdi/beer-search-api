import { injectable } from 'tsyringe';
import { z } from 'zod';
import { AppError } from '../../../middlewares/error.middleware';
import * as usersDb from '../../../services/db/users/users.db';

const AddFavoriteSchema = z.object({ beerId: z.string().min(1) });

@injectable()
export class AddFavoriteUseCase {
  public async execute(userId: number, body: unknown): Promise<{ favorite: unknown }> {
    const { beerId } = AddFavoriteSchema.parse(body);

    const beer = await usersDb.getBeerById(beerId);
    if (!beer) throw new AppError(404, `Beer "${beerId}" not found — search for it first`);

    const exists = await usersDb.findFavorite(userId, beerId);
    if (exists) throw new AppError(409, 'Already in favorites');

    const favorite = await usersDb.addFavorite(userId, beerId);
    return { favorite };
  }
}
