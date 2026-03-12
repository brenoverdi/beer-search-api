import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as listsDb from '../../../services/db/lists/lists.db';
import { ListDetail } from '../lists.model';

@injectable()
export class GetListByIdUseCase {
  public async execute(listId: number, requestingUserId?: number): Promise<ListDetail> {
    const list = await listsDb.getListById(listId);
    if (!list) throw new AppError(404, 'List not found');
    if (!list.isPublic && list.userId !== requestingUserId) throw new AppError(403, 'Forbidden');

    const items = await listsDb.getListItems(listId);
    return { list, items };
  }
}
