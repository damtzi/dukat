import { and, eq, isNotNull, lte } from 'drizzle-orm';

import type { Database } from '../connection';
import { serviceSetting, session, user } from '../schema';

export const ACCOUNT_RECOVERY_DAYS = 30;
export const OWNED_HOUSEHOLD_QUOTA = 10;
export const PENDING_INVITATION_QUOTA = 20;

export class AdministrationError extends Error {
	constructor(
		public readonly code: 'not_found' | 'conflict',
		message: string
	) {
		super(message);
	}
}

const operationalUser = {
	id: user.id,
	name: user.name,
	username: user.username,
	email: user.email,
	emailVerified: user.emailVerified,
	isAdmin: user.isAdmin,
	disabledAt: user.disabledAt,
	deletionRequestedAt: user.deletionRequestedAt,
	createdAt: user.createdAt
};

export function createAdministrationRepository(database: Database) {
	return {
		async accessStatus(userId: string) {
			const [result] = await database
				.select({
					isAdmin: user.isAdmin,
					disabledAt: user.disabledAt,
					deletionRequestedAt: user.deletionRequestedAt
				})
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);
			return result;
		},
		async registrationOpen() {
			const [result] = await database
				.select({ registrationOpen: serviceSetting.registrationOpen })
				.from(serviceSetting)
				.where(eq(serviceSetting.id, 1))
				.limit(1);
			return result?.registrationOpen ?? true;
		},
		async setRegistrationOpen(registrationOpen: boolean) {
			await database
				.insert(serviceSetting)
				.values({ id: 1, registrationOpen })
				.onConflictDoUpdate({
					target: serviceSetting.id,
					set: { registrationOpen, updatedAt: new Date() }
				});
			return { registrationOpen };
		},
		listUsers() {
			return database.select(operationalUser).from(user).orderBy(user.createdAt);
		},
		async setUserDisabled(userId: string, disabled: boolean) {
			const changed = await database.transaction(async (tx) => {
				const result = await tx
					.update(user)
					.set({ disabledAt: disabled ? new Date() : null })
					.where(and(eq(user.id, userId), eq(user.isAdmin, false)))
					.returning(operationalUser);
				if (disabled) await tx.delete(session).where(eq(session.userId, userId));
				return result;
			});
			if (!changed.length)
				throw new AdministrationError('not_found', 'User not found or cannot be changed');
			return changed[0];
		},
		async restoreAccount(userId: string) {
			const changed = await database
				.update(user)
				.set({ deletionRequestedAt: null })
				.where(and(eq(user.id, userId), isNotNull(user.deletionRequestedAt)))
				.returning(operationalUser);
			if (!changed.length) throw new AdministrationError('not_found', 'Account is not recoverable');
			return changed[0];
		},
		purgeExpiredAccounts() {
			const cutoff = new Date(Date.now() - ACCOUNT_RECOVERY_DAYS * 86400_000);
			return database
				.delete(user)
				.where(and(eq(user.isAdmin, false), lte(user.deletionRequestedAt, cutoff)))
				.returning({ id: user.id });
		}
	};
}

export type AdministrationRepository = ReturnType<typeof createAdministrationRepository>;
