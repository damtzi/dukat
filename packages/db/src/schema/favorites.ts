import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

export const favoritePage = sqliteTable(
	'favorite_page',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		path: text('path').notNull(),
		label: text('label').notNull(),
		position: integer('position').notNull()
	},
	(table) => [
		uniqueIndex('favorite_page_user_path_unique').on(table.userId, table.path),
		uniqueIndex('favorite_page_user_position_unique').on(table.userId, table.position)
	]
);
