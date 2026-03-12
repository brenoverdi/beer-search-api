import { z } from 'zod';

export const CreateListSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  isPublic: z.boolean().optional().default(false),
});

export const UpdateListSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const AddItemSchema = z.object({
  beerId: z.string().min(1),
  notes: z.string().max(500).trim().optional(),
});

export interface ListSummary {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  _count: { items: number };
}

export interface ListDetail {
  list: {
    id: number;
    name: string;
    description: string | null;
    isPublic: boolean;
    userId: number;
  };
  items: unknown[];
}
