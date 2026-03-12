import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as listsDb from '../../../services/db/lists/lists.db';
import * as usersDb from '../../../services/db/users/users.db';
import { AddItemSchema } from '../lists.model';

@injectable()
export class AddListItemUseCase {
  public async execute(listId: number, userId: number, body: unknown): Promise<{ item: unknown }> {
    const { beerId, notes } = AddItemSchema.parse(body);

    const list = await listsDb.getListWithOwner(listId, userId);
    if (!list) throw new AppError(404, 'List not found');

    const beer = await usersDb.getBeerById(beerId);
    if (!beer) throw new AppError(404, `Beer "${beerId}" not found — search for it first`);

    const item = await listsDb.addItem(listId, beerId, notes ?? null);
    return { item };
  }
}
