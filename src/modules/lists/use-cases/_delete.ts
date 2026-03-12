import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as listsDb from '../../../services/db/lists/lists.db';

@injectable()
export class DeleteListUseCase {
  public async execute(listId: number, userId: number): Promise<{ message: string }> {
    const deleted = await listsDb.deleteList(listId, userId);
    if ((deleted as { count: number }).count === 0) throw new AppError(404, 'List not found');
    return { message: 'List deleted' };
  }
}
