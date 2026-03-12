import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as listsDb from '../../../services/db/lists/lists.db';
import { UpdateListSchema } from '../lists.model';

@injectable()
export class UpdateListUseCase {
  public async execute(listId: number, userId: number, body: unknown): Promise<{ list: unknown }> {
    const data = UpdateListSchema.parse(body);
    const updated = await listsDb.updateList(listId, userId, data);
    if ((updated as { count: number }).count === 0) throw new AppError(404, 'List not found');
    const list = await listsDb.getListById(listId);
    return { list };
  }
}
