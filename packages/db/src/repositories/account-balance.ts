import { and, eq, gt, isNull, lte } from 'drizzle-orm';

import type { FinancialDatabase } from '../connection';
import { ledgerBalanceCorrection, ledgerTransaction } from '../schema';
import type { FinancialTransaction } from './mutation-receipt';

type BalanceSource = FinancialDatabase | FinancialTransaction;
type AccountBalanceBasis = {
	workspaceId: string;
	id: string;
	openingDate: string;
	openingBalanceMinor: bigint;
};

export async function accountBalanceActivity(
	source: BalanceSource,
	account: Omit<AccountBalanceBasis, 'openingBalanceMinor'>,
	throughDate?: string
) {
	const transactions = await source
		.select({ kind: ledgerTransaction.kind, amountMinor: ledgerTransaction.amountMinor })
		.from(ledgerTransaction)
		.where(
			and(
				eq(ledgerTransaction.workspaceId, account.workspaceId),
				eq(ledgerTransaction.accountId, account.id),
				isNull(ledgerTransaction.trashedAt),
				gt(ledgerTransaction.date, account.openingDate),
				throughDate ? lte(ledgerTransaction.date, throughDate) : undefined
			)
		);
	const corrections = await source
		.select({ amountMinor: ledgerBalanceCorrection.amountMinor })
		.from(ledgerBalanceCorrection)
		.where(
			and(
				eq(ledgerBalanceCorrection.workspaceId, account.workspaceId),
				eq(ledgerBalanceCorrection.accountId, account.id),
				isNull(ledgerBalanceCorrection.trashedAt),
				gt(ledgerBalanceCorrection.date, account.openingDate),
				throughDate ? lte(ledgerBalanceCorrection.date, throughDate) : undefined
			)
		);
	return (
		transactions.reduce(
			(sum, row) => sum + (row.kind === 'expense' ? -row.amountMinor : row.amountMinor),
			0n
		) + corrections.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
	);
}

export async function calculateAccountBalance(
	source: BalanceSource,
	account: AccountBalanceBasis,
	throughDate?: string
) {
	return account.openingBalanceMinor + (await accountBalanceActivity(source, account, throughDate));
}
