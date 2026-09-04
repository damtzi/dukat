import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './ledger.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId });
const success = async (c: any, operation: () => Promise<unknown>) => {
	try {
		return c.json(await operation(), 200);
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (code === 'not_found') return c.json({ message: (error as Error).message }, 404);
		if (code === 'conflict') return c.json({ message: (error as Error).message }, 409);
		if (code === 'invalid') return c.json({ message: (error as Error).message }, 400);
		throw error;
	}
};

export const ledgerRouter = router
	.openapi(routes.listAccounts, (c) =>
		success(c, () => c.var.services.ledger.listAccounts(context(c)))
	)
	.openapi(routes.createAccount, (c) =>
		success(c, () => c.var.services.ledger.createAccount(context(c), c.req.valid('json')))
	)
	.openapi(routes.updateAccount, (c) =>
		success(c, () => {
			const p = c.req.valid('param');
			return c.var.services.ledger.updateAccount(context(c), p.accountId, c.req.valid('json'));
		})
	)
	.openapi(routes.accountArchiveImpact, (c) =>
		success(c, () =>
			c.var.services.ledger.accountArchiveImpact(context(c), c.req.valid('param').accountId)
		)
	)
	.openapi(routes.accountAction('delete'), (c) =>
		success(c, () =>
			c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'delete',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.accountAction('archive'), (c) =>
		success(c, () =>
			c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'archive',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.accountAction('restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.listTransactions, (c) =>
		success(c, () =>
			c.var.services.ledger.listTransactions(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			)
		)
	)
	.openapi(routes.searchTransactions, (c) =>
		success(c, () => c.var.services.ledger.searchTransactions(context(c), c.req.valid('query')))
	)
	.openapi(routes.listHouseholdExpenses, (c) =>
		success(c, () =>
			c.var.services.ledger.listHouseholdExpenses(
				context(c),
				c.req.valid('query').includeTrashed === 'true'
			)
		)
	)
	.openapi(routes.createHouseholdExpense, (c) =>
		success(c, () => c.var.services.ledger.createHouseholdExpense(context(c), c.req.valid('json')))
	)
	.openapi(routes.updateHouseholdExpense, (c) =>
		success(c, () =>
			c.var.services.ledger.updateHouseholdExpense(
				context(c),
				c.req.valid('param').expenseId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.householdExpenseAction('trash'), (c) =>
		success(c, () =>
			c.var.services.ledger.householdExpenseAction(
				context(c),
				c.req.valid('param').expenseId,
				'trash',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.householdExpenseAction('restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.householdExpenseAction(
				context(c),
				c.req.valid('param').expenseId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.createTransaction, (c) =>
		success(c, () =>
			c.var.services.ledger.createTransaction(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.createRefund, (c) =>
		success(c, () =>
			c.var.services.ledger.createRefund(
				context(c),
				c.req.valid('param').transactionId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.updateTransaction, (c) =>
		success(c, () =>
			c.var.services.ledger.updateTransaction(
				context(c),
				c.req.valid('param').transactionId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transactionAction('trash'), (c) =>
		success(c, () =>
			c.var.services.ledger.transactionAction(
				context(c),
				c.req.valid('param').transactionId,
				'trash',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transactionAction('restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.transactionAction(
				context(c),
				c.req.valid('param').transactionId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transactionHistory, (c) =>
		success(c, () =>
			c.var.services.ledger.history(context(c), 'transaction', c.req.valid('param').transactionId)
		)
	)
	.openapi(routes.accountHistory, (c) =>
		success(c, () =>
			c.var.services.ledger.history(context(c), 'account', c.req.valid('param').accountId)
		)
	)
	.openapi(routes.createTransfer, (c) =>
		success(c, () => c.var.services.ledger.createTransfer(context(c), c.req.valid('json')))
	)
	.openapi(routes.listTransfers, (c) =>
		success(c, () =>
			c.var.services.ledger.listTransfers(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			)
		)
	)
	.openapi(routes.updateTransfer, (c) =>
		success(c, () =>
			c.var.services.ledger.updateTransfer(
				context(c),
				c.req.valid('param').transferId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transferAction('trash'), (c) =>
		success(c, () =>
			c.var.services.ledger.transferAction(
				context(c),
				c.req.valid('param').transferId,
				'trash',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transferAction('restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.transferAction(
				context(c),
				c.req.valid('param').transferId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.transferHistory, (c) =>
		success(c, () =>
			c.var.services.ledger.history(context(c), 'transfer', c.req.valid('param').transferId)
		)
	)
	.openapi(routes.createBalanceCheck, (c) =>
		success(c, () => c.var.services.ledger.createBalanceCheck(context(c), c.req.valid('json')))
	)
	.openapi(routes.listBalanceChecks, (c) =>
		success(c, () =>
			c.var.services.ledger.listBalanceChecks(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			)
		)
	)
	.openapi(routes.listCorrections, (c) =>
		success(c, () =>
			c.var.services.ledger.listBalanceCorrections(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			)
		)
	)
	.openapi(routes.updateBalanceCheck, (c) =>
		success(c, () =>
			c.var.services.ledger.updateBalanceCheck(
				context(c),
				c.req.valid('param').entityId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.createCorrection, (c) =>
		success(c, () => c.var.services.ledger.createBalanceCorrection(context(c), c.req.valid('json')))
	)
	.openapi(routes.reconciliationAction('balance-checks', 'trash'), (c) =>
		success(c, () =>
			c.var.services.ledger.reconciliationAction(
				context(c),
				'balance_check',
				c.req.valid('param').entityId,
				'trash',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.reconciliationAction('balance-checks', 'restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.reconciliationAction(
				context(c),
				'balance_check',
				c.req.valid('param').entityId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.reconciliationAction('corrections', 'trash'), (c) =>
		success(c, () =>
			c.var.services.ledger.reconciliationAction(
				context(c),
				'correction',
				c.req.valid('param').entityId,
				'trash',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.reconciliationAction('corrections', 'restore'), (c) =>
		success(c, () =>
			c.var.services.ledger.reconciliationAction(
				context(c),
				'correction',
				c.req.valid('param').entityId,
				'restore',
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.reconciliationHistory('balance-checks'), (c) =>
		success(c, () =>
			c.var.services.ledger.history(context(c), 'balance_check', c.req.valid('param').entityId)
		)
	)
	.openapi(routes.reconciliationHistory('corrections'), (c) =>
		success(c, () =>
			c.var.services.ledger.history(context(c), 'correction', c.req.valid('param').entityId)
		)
	);
