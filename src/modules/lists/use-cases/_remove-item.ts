import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as listsDb from '../../../services/db/lists/lists.db';

@injectable()
export class RemoveListItemUseCase {
  public async execute(listId: number, userId: number, beerId: string): Promise<{ message: string }> {
    const list = await listsDb.getListWithOwner(listId, userId);
    if (!list) throw new AppError(404, 'List not found');

    const deleted = await listsDb.removeItem(listId, beerId);
    if ((deleted as { count: number }).count === 0) throw new AppError(404, 'Item not found in list');
    return { message: 'Item removed from list' };
  }
}
