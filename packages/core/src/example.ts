import { z } from 'zod';

export const exampleStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ExampleStatus = z.infer<typeof exampleStatusSchema>;

export const exampleEntitySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	status: exampleStatusSchema
});
export type ExampleEntity = z.infer<typeof exampleEntitySchema>;
