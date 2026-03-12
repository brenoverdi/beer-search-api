import { injectable } from 'tsyringe';
import * as listsDb from '../../../services/db/lists/lists.db';
import { CreateListSchema } from '../lists.model';

@injectable()
export class CreateListUseCase {
  public async execute(userId: number, body: unknown): Promise<{ list: unknown }> {
    const { name, description, isPublic } = CreateListSchema.parse(body);
    const list = await listsDb.createList(userId, name, description ?? null, isPublic);
    return { list };
  }
}
