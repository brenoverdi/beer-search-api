import { injectable } from 'tsyringe';
import * as listsDb from '../../../services/db/lists/lists.db';
import { ListSummary } from '../lists.model';

@injectable()
export class GetListsUseCase {
  public async execute(userId: number): Promise<{ lists: ListSummary[] }> {
    const lists = await listsDb.getLists(userId);
    return { lists: lists as ListSummary[] };
  }
}
