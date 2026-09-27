import { and, eq, isNull } from 'drizzle-orm';
import { createMortgageSchema, mortgageSchedule, type MortgagePayment } from '@dukat/core/mortgage';
import { todayInDefaultTimeZone } from '@dukat/core/ledger';
import { ZodError } from 'zod';
import type { FinancialDatabase } from '../connection';
import { financialAccount, mortgage } from '../schema';
import { DomainError } from './domain-error';
import { withMutationReceipt } from './mutation-receipt';
import { findAuthorizedWorkspace } from './workspaces';

type Context = { userId: string; workspaceId: string };
export class MortgageError extends DomainError {}

export function createMortgageRepository(database: FinancialDatabase) {
	const load = async (context: Context) => {
		if (!(await findAuthorizedWorkspace(database, context)))
			throw new MortgageError('not_found', 'Workspace not found');
		const [row] = await database
			.select({ mortgage, account: financialAccount })
			.from(mortgage)
			.innerJoin(
				financialAccount,
				and(
					eq(financialAccount.workspaceId, mortgage.workspaceId),
					eq(financialAccount.id, mortgage.paymentAccountId)
				)
			)
			.where(eq(mortgage.workspaceId, context.workspaceId));
		if (!row) return null;
		return {
			id: row.mortgage.id,
			workspaceId: row.mortgage.workspaceId,
			paymentAccountId: row.mortgage.paymentAccountId,
			paymentAccountName: row.account.name,
			currency: row.account.currency,
			originalPrincipalMinor: row.mortgage.originalPrincipalMinor.toString(),
			currentBalanceMinor: row.mortgage.currentBalanceMinor.toString(),
			startDate: row.mortgage.startDate,
			termMonths: row.mortgage.termMonths,
			interestType: row.mortgage.interestType,
			annualRateBasisPoints: row.mortgage.annualRateBasisPoints,
			schedule: JSON.parse(row.mortgage.scheduleJson) as MortgagePayment[]
		};
	};
	return {
		async get(context: Context) {
			return load(context);
		},
		async create(context: Context, raw: unknown) {
			let input;
			try {
				input = createMortgageSchema.parse(raw);
			} catch (error) {
				if (error instanceof ZodError)
					throw new MortgageError('invalid', error.issues[0]?.message ?? 'Invalid mortgage');
				throw error;
			}
			return database.transaction(async (tx) => {
				if (!(await findAuthorizedWorkspace(tx, context)))
					throw new MortgageError('not_found', 'Workspace not found');
				return withMutationReceipt(
					tx,
					context,
					'mortgage.create',
					input.idempotencyKey,
					input,
					async () => {
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, input.paymentAccountId),
									eq(financialAccount.workspaceId, context.workspaceId),
									isNull(financialAccount.archivedAt)
								)
							);
						if (!account || account.type === 'credit_card')
							throw new MortgageError('not_found', 'Payment account not found');
						const schedule = mortgageSchedule(input, todayInDefaultTimeZone());
						if (schedule.length === 0)
							throw new MortgageError('invalid', 'The mortgage term must have a future payment');
						const [existing] = await tx
							.select({ id: mortgage.id })
							.from(mortgage)
							.where(eq(mortgage.workspaceId, context.workspaceId));
						if (existing) throw new MortgageError('conflict', 'Mortgage already configured');
						const id = crypto.randomUUID();
						await tx.insert(mortgage).values({
							id,
							workspaceId: context.workspaceId,
							paymentAccountId: account.id,
							originalPrincipalMinor: BigInt(input.originalPrincipalMinor),
							currentBalanceMinor: BigInt(input.currentBalanceMinor),
							startDate: input.startDate,
							termMonths: input.termMonths,
							interestType: input.interestType,
							annualRateBasisPoints: input.annualRateBasisPoints,
							scheduleJson: JSON.stringify(schedule)
						});
						return {
							id,
							workspaceId: context.workspaceId,
							paymentAccountId: account.id,
							originalPrincipalMinor: input.originalPrincipalMinor,
							currentBalanceMinor: input.currentBalanceMinor,
							startDate: input.startDate,
							termMonths: input.termMonths,
							interestType: input.interestType,
							annualRateBasisPoints: input.annualRateBasisPoints,
							currency: account.currency,
							paymentAccountName: account.name,
							schedule
						};
					},
					() =>
						new MortgageError('conflict', 'Idempotency key was already used for another request')
				);
			});
		}
	};
}
export type MortgageRepository = ReturnType<typeof createMortgageRepository>;
