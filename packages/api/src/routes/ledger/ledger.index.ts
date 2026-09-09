import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './ledger.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId });

export const ledgerRouter = router
	.openapi(routes.listAccounts, async (c) =>
		c.json(await c.var.services.ledger.listAccounts(context(c)), 200)
	)
	.openapi(routes.createAccount, async (c) =>
		c.json(await c.var.services.ledger.createAccount(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.updateAccount, async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.ledger.updateAccount(context(c), p.accountId, c.req.valid('json')),
			200
		);
	})
	.openapi(routes.accountArchiveImpact, async (c) =>
		c.json(
			await c.var.services.ledger.accountArchiveImpact(context(c), c.req.valid('param').accountId),
			200
		)
	)
	.openapi(routes.accountAction('delete'), async (c) =>
		c.json(
			await c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'delete',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.accountAction('archive'), async (c) =>
		c.json(
			await c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'archive',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.accountAction('restore'), async (c) =>
		c.json(
			await c.var.services.ledger.accountAction(
				context(c),
				c.req.valid('param').accountId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.listTransactions, async (c) =>
		c.json(
			await c.var.services.ledger.listTransactions(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.searchTransactions, async (c) =>
		c.json(await c.var.services.ledger.searchTransactions(context(c), c.req.valid('query')), 200)
	)
	.openapi(routes.listHouseholdExpenses, async (c) =>
		c.json(
			await c.var.services.ledger.listHouseholdExpenses(
				context(c),
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.createHouseholdExpense, async (c) =>
		c.json(await c.var.services.ledger.createHouseholdExpense(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.updateHouseholdExpense, async (c) =>
		c.json(
			await c.var.services.ledger.updateHouseholdExpense(
				context(c),
				c.req.valid('param').expenseId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.householdExpenseAction('trash'), async (c) =>
		c.json(
			await c.var.services.ledger.householdExpenseAction(
				context(c),
				c.req.valid('param').expenseId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.householdExpenseAction('restore'), async (c) =>
		c.json(
			await c.var.services.ledger.householdExpenseAction(
				context(c),
				c.req.valid('param').expenseId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.listSettlementPayments, async (c) =>
		c.json(
			await c.var.services.ledger.listSettlementPayments(
				context(c),
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.listSettlementBalances, async (c) =>
		c.json(await c.var.services.ledger.listSettlementBalances(context(c)), 200)
	)
	.openapi(routes.createSettlementPayment, async (c) =>
		c.json(
			await c.var.services.ledger.createSettlementPayment(context(c), c.req.valid('json')),
			200
		)
	)
	.openapi(routes.settlementPaymentAction('trash'), async (c) =>
		c.json(
			await c.var.services.ledger.settlementPaymentAction(
				context(c),
				c.req.valid('param').paymentId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.settlementPaymentAction('restore'), async (c) =>
		c.json(
			await c.var.services.ledger.settlementPaymentAction(
				context(c),
				c.req.valid('param').paymentId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.createTransaction, async (c) =>
		c.json(
			await c.var.services.ledger.createTransaction(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.createRefund, async (c) =>
		c.json(
			await c.var.services.ledger.createRefund(
				context(c),
				c.req.valid('param').transactionId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.updateTransaction, async (c) =>
		c.json(
			await c.var.services.ledger.updateTransaction(
				context(c),
				c.req.valid('param').transactionId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transactionAction('trash'), async (c) =>
		c.json(
			await c.var.services.ledger.transactionAction(
				context(c),
				c.req.valid('param').transactionId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transactionAction('restore'), async (c) =>
		c.json(
			await c.var.services.ledger.transactionAction(
				context(c),
				c.req.valid('param').transactionId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transactionHistory, async (c) =>
		c.json(
			await c.var.services.ledger.history(
				context(c),
				'transaction',
				c.req.valid('param').transactionId
			),
			200
		)
	)
	.openapi(routes.accountHistory, async (c) =>
		c.json(
			await c.var.services.ledger.history(context(c), 'account', c.req.valid('param').accountId),
			200
		)
	)
	.openapi(routes.createTransfer, async (c) =>
		c.json(await c.var.services.ledger.createTransfer(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.listTransfers, async (c) =>
		c.json(
			await c.var.services.ledger.listTransfers(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.updateTransfer, async (c) =>
		c.json(
			await c.var.services.ledger.updateTransfer(
				context(c),
				c.req.valid('param').transferId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transferAction('trash'), async (c) =>
		c.json(
			await c.var.services.ledger.transferAction(
				context(c),
				c.req.valid('param').transferId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transferAction('restore'), async (c) =>
		c.json(
			await c.var.services.ledger.transferAction(
				context(c),
				c.req.valid('param').transferId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.transferHistory, async (c) =>
		c.json(
			await c.var.services.ledger.history(context(c), 'transfer', c.req.valid('param').transferId),
			200
		)
	)
	.openapi(routes.createBalanceCheck, async (c) =>
		c.json(await c.var.services.ledger.createBalanceCheck(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.listBalanceChecks, async (c) =>
		c.json(
			await c.var.services.ledger.listBalanceChecks(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.listCorrections, async (c) =>
		c.json(
			await c.var.services.ledger.listBalanceCorrections(
				context(c),
				c.req.valid('param').accountId,
				c.req.valid('query').includeTrashed === 'true'
			),
			200
		)
	)
	.openapi(routes.updateBalanceCheck, async (c) =>
		c.json(
			await c.var.services.ledger.updateBalanceCheck(
				context(c),
				c.req.valid('param').entityId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.createCorrection, async (c) =>
		c.json(
			await c.var.services.ledger.createBalanceCorrection(context(c), c.req.valid('json')),
			200
		)
	)
	.openapi(routes.reconciliationAction('balance-checks', 'trash'), async (c) =>
		c.json(
			await c.var.services.ledger.reconciliationAction(
				context(c),
				'balance_check',
				c.req.valid('param').entityId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.reconciliationAction('balance-checks', 'restore'), async (c) =>
		c.json(
			await c.var.services.ledger.reconciliationAction(
				context(c),
				'balance_check',
				c.req.valid('param').entityId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.reconciliationAction('corrections', 'trash'), async (c) =>
		c.json(
			await c.var.services.ledger.reconciliationAction(
				context(c),
				'correction',
				c.req.valid('param').entityId,
				'trash',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.reconciliationAction('corrections', 'restore'), async (c) =>
		c.json(
			await c.var.services.ledger.reconciliationAction(
				context(c),
				'correction',
				c.req.valid('param').entityId,
				'restore',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.reconciliationHistory('balance-checks'), async (c) =>
		c.json(
			await c.var.services.ledger.history(
				context(c),
				'balance_check',
				c.req.valid('param').entityId
			),
			200
		)
	)
	.openapi(routes.reconciliationHistory('corrections'), async (c) =>
		c.json(
			await c.var.services.ledger.history(context(c), 'correction', c.req.valid('param').entityId),
			200
		)
	);
