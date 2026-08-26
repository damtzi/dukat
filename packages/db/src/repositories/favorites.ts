import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../connection';
import { favoritePage } from '../schema';

const summary = {
	id: favoritePage.id,
	path: favoritePage.path,
	label: favoritePage.label
};

export function createFavoriteRepository(database: Database) {
	return {
		list(userId: string) {
			return database
				.select(summary)
				.from(favoritePage)
				.where(eq(favoritePage.userId, userId))
				.orderBy(asc(favoritePage.position));
		},
		async add(userId: string, input: { path: string; label: string }) {
			const [favorite] = await database
				.insert(favoritePage)
				.values({
					id: crypto.randomUUID(),
					userId,
					...input,
					position: sql`(
						select coalesce(max(${favoritePage.position}), 0) + 1
						from ${favoritePage}
						where ${favoritePage.userId} = ${userId}
					)`
				})
				.onConflictDoUpdate({
					target: [favoritePage.userId, favoritePage.path],
					set: { label: input.label }
				})
				.returning(summary);
			return favorite;
		},
		async remove(userId: string, favoriteId: string) {
			await database
				.delete(favoritePage)
				.where(and(eq(favoritePage.id, favoriteId), eq(favoritePage.userId, userId)));
		}
	};
}
