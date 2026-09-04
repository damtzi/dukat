import {
	calendarDateSchema,
	DUKAT_CSV_HEADER,
	decimalToMinor,
	normalizeCategoryName,
	parseCsv
} from '@dukat/core';
import type { Summary } from '@dukat/core';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FinancialDatabase } from '../connection';
import {
	financialAccount,
	householdExpense,
	ledgerAudit,
	ledgerBalanceCorrection,
	ledgerCategory,
	ledgerImportBatch,
	ledgerTransaction,
	mutationReceipt,
	workspace,
	workspaceMembership
} from '../schema';
import { LedgerError } from './ledger';

type Context = { userId: string; workspaceId: string };
const STARTERS = [
	'Salary',
	'Other income',
	'Housing',
	'Groceries',
	'Eating out',
	'Transport',
	'Bills',
	'Health',
	'Shopping',
	'Entertainment',
	'Travel',
	'Other'
];
export { STARTERS as STARTER_CATEGORIES };

const isUniqueConstraint = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	(('code' in error && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') ||
		(error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) ||
		('cause' in error && isUniqueConstraint((error as { cause?: unknown }).cause)));
const isForeignKeyConstraint = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	((error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) ||
		('cause' in error && isForeignKeyConstraint((error as { cause?: unknown }).cause)));

const json = (value: unknown) =>
	JSON.stringify(value, (_key, item) =>
		typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item
	);
const publicRow = <T extends Record<string, unknown>>(row: T) => JSON.parse(json(row)) as T;

export function createInsightsRepository(db: FinancialDatabase) {
	type Tx = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];
	const authorize = async (tx: Tx, c: Context) => {
		const rows = await tx
			.select({ id: workspace.id })
			.from(workspace)
			.leftJoin(
				workspaceMembership,
				and(
					eq(workspaceMembership.workspaceId, workspace.id),
					eq(workspaceMembership.userId, c.userId)
				)
			)
			.where(
				and(
					eq(workspace.id, c.workspaceId),
					isNull(workspace.deletedAt),
					or(
						and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, c.userId)),
						and(eq(workspace.type, 'household'), eq(workspaceMembership.userId, c.userId))
					)
				)
			)
			.limit(1);
		if (!rows.length) throw new LedgerError('not_found', 'Workspace not found');
	};
	const idempotent = async <T>(
		tx: Tx,
		c: Context,
		operation: string,
		key: string,
		request: unknown,
		run: () => Promise<T>
	) => {
		const requestJson = json(request);
		const [receipt] = await tx
			.select()
			.from(mutationReceipt)
			.where(
				and(
					eq(mutationReceipt.workspaceId, c.workspaceId),
					eq(mutationReceipt.actorUserId, c.userId),
					eq(mutationReceipt.operation, operation),
					eq(mutationReceipt.idempotencyKey, key)
				)
			)
			.limit(1);
		if (receipt) {
			if (receipt.requestJson !== requestJson)
				throw new LedgerError(
					'conflict',
					'Idempotency key was already used for a different request'
				);
			return JSON.parse(receipt.responseJson) as T;
		}
		const result = await run();
		await tx.insert(mutationReceipt).values({
			id: crypto.randomUUID(),
			workspaceId: c.workspaceId,
			actorUserId: c.userId,
			operation,
			idempotencyKey: key,
			requestJson,
			responseJson: json(result)
		});
		return result;
	};
	const audit = (
		tx: Tx,
		c: Context,
		type: 'category' | 'import_batch' | 'transaction',
		id: string,
		action: string,
		before: unknown,
		after: unknown
	) =>
		tx.insert(ledgerAudit).values({
			id: crypto.randomUUID(),
			workspaceId: c.workspaceId,
			actorUserId: c.userId,
			actorDisplay: c.userId,
			entityType: type,
			entityId: id,
			action,
			beforeJson: before ? json(before) : null,
			afterJson: after ? json(after) : null
		});
	const category = async (tx: Tx, c: Context, id: string | null | undefined) => {
		if (!id) return null;
		const [row] = await tx
			.select()
			.from(ledgerCategory)
			.where(and(eq(ledgerCategory.id, id), eq(ledgerCategory.workspaceId, c.workspaceId)));
		if (!row) throw new LedgerError('not_found', 'Category not found');
		if (row.archivedAt) throw new LedgerError('conflict', 'Archived categories cannot be selected');
		return row;
	};
	return {
		template() {
			return `${DUKAT_CSV_HEADER}\n`;
		},
		listCategories(c: Context) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				return tx
					.select()
					.from(ledgerCategory)
					.where(eq(ledgerCategory.workspaceId, c.workspaceId))
					.orderBy(asc(sql`lower(${ledgerCategory.name})`), asc(ledgerCategory.id));
			});
		},
		createCategory(c: Context, input: { name: string; idempotencyKey: string }) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				return idempotent(
					tx,
					c,
					'create_category',
					input.idempotencyKey,
					{ name: input.name },
					async () => {
						const row = {
							id: crypto.randomUUID(),
							workspaceId: c.workspaceId,
							name: input.name.trim(),
							normalizedName: normalizeCategoryName(input.name.trim())
						};
						if (!row.name || row.name.length > 120)
							throw new LedgerError('invalid', 'Category name is required');
						try {
							await tx.insert(ledgerCategory).values(row);
						} catch (error) {
							if (!isUniqueConstraint(error)) throw error;
							throw new LedgerError('conflict', 'Category name already exists');
						}
						const [created] = await tx
							.select()
							.from(ledgerCategory)
							.where(
								and(eq(ledgerCategory.id, row.id), eq(ledgerCategory.workspaceId, c.workspaceId))
							);
						await audit(tx, c, 'category', row.id, 'created', null, created);
						return publicRow(created);
					}
				);
			});
		},
		updateCategory(
			c: Context,
			id: string,
			input: { name: string; version: number; idempotencyKey: string }
		) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				return idempotent(
					tx,
					c,
					'rename_category',
					input.idempotencyKey,
					{ id, name: input.name, version: input.version },
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerCategory)
							.where(and(eq(ledgerCategory.id, id), eq(ledgerCategory.workspaceId, c.workspaceId)));
						if (!before) throw new LedgerError('not_found', 'Category not found');
						let after;
						try {
							[after] = await tx
								.update(ledgerCategory)
								.set({
									name: input.name.trim(),
									normalizedName: normalizeCategoryName(input.name.trim()),
									version: input.version + 1,
									updatedAt: new Date()
								})
								.where(
									and(
										eq(ledgerCategory.workspaceId, c.workspaceId),
										eq(ledgerCategory.id, id),
										eq(ledgerCategory.version, input.version)
									)
								)
								.returning();
						} catch (error) {
							if (!isUniqueConstraint(error)) throw error;
							throw new LedgerError('conflict', 'Category name already exists');
						}
						if (!after) throw new LedgerError('conflict', 'Category changed concurrently');
						await audit(tx, c, 'category', id, 'renamed', before, after);
						return publicRow(after);
					}
				);
			});
		},
		categoryAction(
			c: Context,
			id: string,
			action: 'delete' | 'archive' | 'restore',
			input: { version: number; idempotencyKey: string }
		) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				return idempotent(
					tx,
					c,
					`${action}_category`,
					input.idempotencyKey,
					{ id, version: input.version },
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerCategory)
							.where(and(eq(ledgerCategory.id, id), eq(ledgerCategory.workspaceId, c.workspaceId)));
						if (!before) throw new LedgerError('not_found', 'Category not found');
						const used = await tx
							.select({ id: ledgerTransaction.id })
							.from(ledgerTransaction)
							.where(eq(ledgerTransaction.categoryId, id))
							.limit(1);
						let after: typeof before | null = null;
						if (action === 'delete') {
							if (used.length)
								throw new LedgerError('conflict', 'Used categories can only be archived');
							try {
								const deleted = await tx
									.delete(ledgerCategory)
									.where(
										and(
											eq(ledgerCategory.workspaceId, c.workspaceId),
											eq(ledgerCategory.id, id),
											eq(ledgerCategory.version, input.version)
										)
									)
									.returning();
								if (deleted.length !== 1)
									throw new LedgerError('conflict', 'Category changed concurrently');
							} catch (error) {
								if (!isForeignKeyConstraint(error)) throw error;
								throw new LedgerError('conflict', 'Used categories can only be archived');
							}
						} else if (action === 'archive') {
							[after] = await tx
								.update(ledgerCategory)
								.set({ archivedAt: new Date(), version: input.version + 1, updatedAt: new Date() })
								.where(
									and(
										eq(ledgerCategory.workspaceId, c.workspaceId),
										eq(ledgerCategory.id, id),
										eq(ledgerCategory.version, input.version)
									)
								)
								.returning();
						} else {
							if (!before.archivedAt) throw new LedgerError('conflict', 'Category is not archived');
							[after] = await tx
								.update(ledgerCategory)
								.set({ archivedAt: null, version: input.version + 1, updatedAt: new Date() })
								.where(
									and(
										eq(ledgerCategory.workspaceId, c.workspaceId),
										eq(ledgerCategory.id, id),
										eq(ledgerCategory.version, input.version)
									)
								)
								.returning();
						}
						if (action !== 'delete' && !after)
							throw new LedgerError('conflict', 'Category changed concurrently');
						await audit(tx, c, 'category', id, action, before, after);
						return { id, action };
					}
				);
			});
		},
		async summary(
			c: Context,
			input: { startDate: string; endDate: string; accountIds?: string[] }
		) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				if (input.startDate > input.endDate)
					throw new LedgerError('invalid', 'Start date must not be after end date');
				if (input.accountIds?.length) {
					const accounts = await tx
						.select({ id: financialAccount.id })
						.from(financialAccount)
						.where(
							and(
								eq(financialAccount.workspaceId, c.workspaceId),
								inArray(financialAccount.id, input.accountIds)
							)
						);
					if (
						new Set(accounts.map((account) => account.id)).size !== new Set(input.accountIds).size
					)
						throw new LedgerError('not_found', 'Account not found');
				}
				const transactionRows = await tx
					.select({
						id: ledgerTransaction.id,
						accountId: ledgerTransaction.accountId,
						date: ledgerTransaction.date,
						description: ledgerTransaction.description,
						currency: financialAccount.currency,
						kind: ledgerTransaction.kind,
						categoryId: ledgerTransaction.categoryId,
						categoryName: ledgerCategory.name,
						amount: ledgerTransaction.amountMinor
					})
					.from(ledgerTransaction)
					.innerJoin(financialAccount, eq(financialAccount.id, ledgerTransaction.accountId))
					.leftJoin(ledgerCategory, eq(ledgerCategory.id, ledgerTransaction.categoryId))
					.where(
						and(
							eq(ledgerTransaction.workspaceId, c.workspaceId),
							eq(ledgerTransaction.source, 'manual'),
							sql`not exists (select 1 from ${householdExpense} where ${householdExpense.sourceTransactionId} = ${ledgerTransaction.id})`,
							isNull(ledgerTransaction.trashedAt),
							sql`${ledgerTransaction.date} >= ${input.startDate}`,
							sql`${ledgerTransaction.date} <= ${input.endDate}`,
							input.accountIds?.length
								? inArray(ledgerTransaction.accountId, input.accountIds)
								: undefined
						)
					);
				const householdRows = input.accountIds?.length
					? []
					: await tx
							.select({
								id: householdExpense.id,
								date: householdExpense.date,
								description: householdExpense.description,
								currency: householdExpense.currency,
								categoryId: householdExpense.categoryId,
								categoryName: ledgerCategory.name,
								amount: householdExpense.amountMinor
							})
							.from(householdExpense)
							.leftJoin(ledgerCategory, eq(ledgerCategory.id, householdExpense.categoryId))
							.where(
								and(
									eq(householdExpense.workspaceId, c.workspaceId),
									isNull(householdExpense.trashedAt),
									sql`${householdExpense.date} >= ${input.startDate}`,
									sql`${householdExpense.date} <= ${input.endDate}`
								)
							);
				const rows = [
					...transactionRows,
					...householdRows.map((row) => ({
						...row,
						accountId: null,
						kind: 'expense' as const
					}))
				];
				const map = new Map<string, { total: bigint; rows: typeof rows }>();
				for (const r of rows) {
					const reportKind = r.kind === 'refund' ? 'expense' : r.kind;
					const reportAmount = r.kind === 'refund' ? -r.amount : r.amount;
					const key = JSON.stringify([r.currency, reportKind, r.categoryId, r.categoryName]);
					const group = map.get(key) ?? { total: 0n, rows: [] };
					group.total += reportAmount;
					group.rows.push(r);
					map.set(key, group);
				}
				const currencies = new Map<
					string,
					{
						income: bigint;
						spending: bigint;
						uncategorized: bigint;
						groups: Summary['currencies'][number]['groups'];
					}
				>();
				for (const [key, group] of [...map].sort(([a], [b]) => a.localeCompare(b))) {
					const [currency, kind, categoryId, categoryName] = JSON.parse(key);
					const result = currencies.get(currency) ?? {
						income: 0n,
						spending: 0n,
						uncategorized: 0n,
						groups: []
					};
					if (kind === 'income') result.income += group.total;
					else result.spending += group.total;
					if (!categoryId) result.uncategorized += group.total;
					result.groups.push({
						kind,
						categoryId,
						categoryName: categoryName ?? 'Uncategorized',
						amountMinor: group.total.toString(),
						transactions: group.rows
							.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
							.map((row) => ({
								id: row.id,
								accountId: row.accountId,
								date: row.date,
								kind: row.kind,
								amountMinor: (row.kind === 'refund' ? -row.amount : row.amount).toString(),
								description: row.description
							}))
					});
					currencies.set(currency, result);
				}
				return {
					currencies: [...currencies]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([currency, value]) => ({
							currency,
							incomeMinor: value.income.toString(),
							spendingMinor: value.spending.toString(),
							uncategorizedMinor: value.uncategorized.toString(),
							groups: value.groups
						}))
				};
			});
		},
		preview(c: Context, input: { filename: string; accountId: string; csv: string }, source?: Tx) {
			const operation = async (tx: Tx) => {
				await authorize(tx, c);
				const [account] = await tx
					.select()
					.from(financialAccount)
					.where(
						and(
							eq(financialAccount.id, input.accountId),
							eq(financialAccount.workspaceId, c.workspaceId)
						)
					);
				if (!account) throw new LedgerError('not_found', 'Account not found');
				if (account.archivedAt)
					throw new LedgerError('conflict', 'Archived accounts do not accept imports');
				let parsed: string[][];
				try {
					parsed = parseCsv(input.csv);
				} catch (error) {
					throw new LedgerError('invalid', (error as Error).message);
				}
				const header = parsed.shift();
				const expectedHeader = DUKAT_CSV_HEADER.split(',');
				const actualHeader = header?.map((value, index) =>
					index === 0 ? value.replace(/^\uFEFF/, '') : value
				);
				if (
					!actualHeader ||
					actualHeader.length !== expectedHeader.length ||
					actualHeader.some((value, index) => value !== expectedHeader[index])
				)
					throw new LedgerError('invalid', 'CSV header must exactly match the Dukat template');
				if (!parsed.length) throw new LedgerError('invalid', 'CSV contains no data rows');
				const cats = await tx
					.select()
					.from(ledgerCategory)
					.where(eq(ledgerCategory.workspaceId, c.workspaceId));
				const existing = await tx
					.select()
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.workspaceId, c.workspaceId),
							eq(ledgerTransaction.accountId, input.accountId),
							eq(ledgerTransaction.source, 'manual'),
							isNull(ledgerTransaction.trashedAt)
						)
					);
				const seen = new Set(
					existing.map((r) => `${r.date}|${r.kind}|${r.amountMinor}|${r.description ?? ''}`)
				);
				const rows = parsed.map((r, i) => {
					const errors: string[] = [];
					if (r.length !== 5) errors.push('Expected 5 columns');
					const [date, kind, amount, description = '', categoryName = ''] = r;
					let amountMinor = '';
					if (!calendarDateSchema.safeParse(date).success) errors.push('Invalid date');
					if (kind !== 'income' && kind !== 'expense') errors.push('Invalid kind');
					try {
						amountMinor = decimalToMinor(amount, account.currency);
					} catch (e) {
						errors.push((e as Error).message);
					}
					if (description.length > 500) errors.push('Description is too long');
					const cat = cats.find(
						(x) => x.normalizedName === normalizeCategoryName(categoryName.trim())
					);
					const key = `${date}|${kind}|${amountMinor}|${description}`;
					const duplicateReason = errors.length
						? null
						: seen.has(key)
							? 'Matches an existing or earlier upload transaction'
							: null;
					if (!errors.length) seen.add(key);
					return {
						sourceRow: i + 2,
						date,
						kind,
						amount,
						amountMinor,
						description,
						category: categoryName,
						categoryId: cat && !cat.archivedAt ? cat.id : null,
						categoryStatus: !categoryName
							? 'blank'
							: cat
								? cat.archivedAt
									? 'archived'
									: 'existing'
								: 'unknown',
						errors,
						duplicateReason,
						selected: !errors.length && !duplicateReason
					};
				});
				return { rows };
			};
			return source ? operation(source) : db.transaction(operation);
		},
		confirm(
			c: Context,
			input: {
				filename: string;
				accountId: string;
				csv: string;
				rows: {
					sourceRow: number;
					include: boolean;
					duplicateAcknowledged: boolean;
					categoryId?: string | null;
					createCategory?: string;
				}[];
				idempotencyKey: string;
			}
		) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				const request = {
					filename: input.filename.trim(),
					accountId: input.accountId,
					rows: input.rows,
					csvSha256: createHash('sha256').update(input.csv, 'utf8').digest('hex')
				};
				return idempotent(tx, c, 'confirm_csv_import', input.idempotencyKey, request, async () => {
					const sourceRows = input.rows.map((row) => row.sourceRow);
					if (new Set(sourceRows).size !== sourceRows.length)
						throw new LedgerError('invalid', 'Source rows must be unique');
					const preview = await this.preview(c, input, tx);
					if (
						sourceRows.some((sourceRow) => !preview.rows.some((row) => row.sourceRow === sourceRow))
					)
						throw new LedgerError('invalid', 'A selected source row does not exist in the CSV');
					const selected = input.rows.filter((row) => row.include);
					if (!selected.length)
						throw new LedgerError('invalid', 'Select at least one row to import');
					const [account] = await tx
						.select()
						.from(financialAccount)
						.where(
							and(
								eq(financialAccount.id, input.accountId),
								eq(financialAccount.workspaceId, c.workspaceId)
							)
						);
					if (!account || account.archivedAt)
						throw new LedgerError('conflict', 'Account cannot accept imports');
					const current = await tx
						.select({ kind: ledgerTransaction.kind, amount: ledgerTransaction.amountMinor })
						.from(ledgerTransaction)
						.where(
							and(
								eq(ledgerTransaction.workspaceId, c.workspaceId),
								eq(ledgerTransaction.accountId, account.id),
								isNull(ledgerTransaction.trashedAt),
								gt(ledgerTransaction.date, account.openingDate)
							)
						);
					let projected = current.reduce(
						(total, row) => total + (row.kind === 'expense' ? -row.amount : row.amount),
						account.openingBalanceMinor
					);
					const corrections = await tx
						.select({ amount: ledgerBalanceCorrection.amountMinor })
						.from(ledgerBalanceCorrection)
						.where(
							and(
								eq(ledgerBalanceCorrection.workspaceId, c.workspaceId),
								eq(ledgerBalanceCorrection.accountId, account.id),
								isNull(ledgerBalanceCorrection.trashedAt),
								gt(ledgerBalanceCorrection.date, account.openingDate)
							)
						);
					projected += corrections.reduce((sum, row) => sum + BigInt(row.amount), 0n);
					for (const choice of selected) {
						const row = preview.rows.find((candidate) => candidate.sourceRow === choice.sourceRow)!;
						if (!row.errors.length && row.date > account.openingDate)
							projected +=
								row.kind === 'income' ? BigInt(row.amountMinor) : -BigInt(row.amountMinor);
					}
					if (projected < -(1n << 63n) || projected > (1n << 63n) - 1n)
						throw new LedgerError(
							'invalid',
							'Import would put the account balance outside int64 range'
						);
					if (!account.activityStartedAt)
						await tx
							.update(financialAccount)
							.set({ activityStartedAt: new Date() })
							.where(eq(financialAccount.id, account.id));
					const batch = {
						id: crypto.randomUUID(),
						workspaceId: c.workspaceId,
						accountId: input.accountId,
						filename: input.filename,
						actorUserId: c.userId
					};
					await tx.insert(ledgerImportBatch).values(batch);
					let count = 0;
					const createdCategories = new Map<string, string>();
					for (const choice of selected) {
						const row = preview.rows.find((x) => x.sourceRow === choice.sourceRow);
						if (!row || row.errors.length)
							throw new LedgerError('invalid', `Invalid source row ${choice.sourceRow}`);
						if (row.duplicateReason && !choice.duplicateAcknowledged)
							throw new LedgerError(
								'invalid',
								`Duplicate row ${choice.sourceRow} was not included deliberately`
							);
						let categoryId = choice.categoryId ?? null;
						if (choice.createCategory) {
							const normalizedName = normalizeCategoryName(choice.createCategory.trim());
							const reused = createdCategories.get(normalizedName);
							if (reused) categoryId = reused;
							else {
								const created = {
									id: crypto.randomUUID(),
									workspaceId: c.workspaceId,
									name: choice.createCategory.trim(),
									normalizedName
								};
								try {
									await tx.insert(ledgerCategory).values(created);
								} catch (error) {
									if (!isUniqueConstraint(error)) throw error;
									throw new LedgerError(
										'conflict',
										`Category ${choice.createCategory} already exists`
									);
								}
								categoryId = created.id;
								createdCategories.set(normalizedName, created.id);
								await audit(tx, c, 'category', created.id, 'created', null, created);
							}
						}
						await category(tx, c, categoryId);
						const created = {
							id: crypto.randomUUID(),
							workspaceId: c.workspaceId,
							accountId: input.accountId,
							categoryId,
							importBatchId: batch.id,
							importSourceRow: row.sourceRow,
							kind: row.kind as 'income' | 'expense',
							amountMinor: BigInt(row.amountMinor),
							date: row.date,
							description: row.description || null
						};
						await tx.insert(ledgerTransaction).values(created);
						await audit(tx, c, 'transaction', created.id, 'created', null, {
							...created,
							amountMinor: row.amountMinor
						});
						count++;
					}
					await audit(tx, c, 'import_batch', batch.id, 'created', null, { ...batch, count });
					const [storedBatch] = await tx
						.select()
						.from(ledgerImportBatch)
						.where(
							and(
								eq(ledgerImportBatch.id, batch.id),
								eq(ledgerImportBatch.workspaceId, c.workspaceId)
							)
						);
					return publicRow({ ...storedBatch, count });
				});
			});
		},
		listImports(c: Context) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				const rows = await tx
					.select()
					.from(ledgerImportBatch)
					.where(eq(ledgerImportBatch.workspaceId, c.workspaceId))
					.orderBy(desc(ledgerImportBatch.createdAt), asc(ledgerImportBatch.id));
				return rows.map(publicRow);
			});
		},
		importDetail(c: Context, id: string) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				const [batch] = await tx
					.select()
					.from(ledgerImportBatch)
					.where(
						and(eq(ledgerImportBatch.id, id), eq(ledgerImportBatch.workspaceId, c.workspaceId))
					);
				if (!batch) throw new LedgerError('not_found', 'Import batch not found');
				const transactions = await tx
					.select()
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.importBatchId, id),
							eq(ledgerTransaction.workspaceId, c.workspaceId)
						)
					);
				return {
					...publicRow(batch),
					transactions: transactions.map((r) =>
						publicRow({ ...r, amountMinor: r.amountMinor.toString() })
					)
				};
			});
		},
		trashImport(c: Context, id: string, idempotencyKey: string) {
			return db.transaction(async (tx) => {
				await authorize(tx, c);
				return idempotent(tx, c, 'trash_csv_import', idempotencyKey, { importId: id }, async () => {
					const [batch] = await tx
						.select()
						.from(ledgerImportBatch)
						.where(
							and(eq(ledgerImportBatch.id, id), eq(ledgerImportBatch.workspaceId, c.workspaceId))
						);
					if (!batch) throw new LedgerError('not_found', 'Import batch not found');
					if (batch.trashedAt) throw new LedgerError('conflict', 'Import batch is already trashed');
					const [account] = await tx
						.select()
						.from(financialAccount)
						.where(
							and(
								eq(financialAccount.id, batch.accountId),
								eq(financialAccount.workspaceId, c.workspaceId)
							)
						);
					if (!account || account.archivedAt)
						throw new LedgerError('conflict', 'Archived accounts do not allow import trash');
					const rows = await tx
						.select()
						.from(ledgerTransaction)
						.where(
							and(
								eq(ledgerTransaction.workspaceId, c.workspaceId),
								eq(ledgerTransaction.importBatchId, id),
								isNull(ledgerTransaction.trashedAt)
							)
						);
					const now = new Date();
					for (const row of rows) {
						const updated = await tx
							.update(ledgerTransaction)
							.set({ trashedAt: now, version: row.version + 1, updatedAt: now })
							.where(
								and(
									eq(ledgerTransaction.id, row.id),
									eq(ledgerTransaction.workspaceId, c.workspaceId),
									eq(ledgerTransaction.version, row.version),
									isNull(ledgerTransaction.trashedAt)
								)
							)
							.returning();
						if (updated.length !== 1)
							throw new LedgerError('conflict', 'Import transaction changed concurrently');
						await audit(tx, c, 'transaction', row.id, 'trash', row, updated[0]);
					}
					const batchUpdate = await tx
						.update(ledgerImportBatch)
						.set({ trashedAt: now })
						.where(
							and(
								eq(ledgerImportBatch.id, id),
								eq(ledgerImportBatch.workspaceId, c.workspaceId),
								isNull(ledgerImportBatch.trashedAt)
							)
						)
						.returning();
					if (batchUpdate.length !== 1)
						throw new LedgerError('conflict', 'Import batch changed concurrently');
					const remaining = await tx
						.select({ kind: ledgerTransaction.kind, amount: ledgerTransaction.amountMinor })
						.from(ledgerTransaction)
						.where(
							and(
								eq(ledgerTransaction.workspaceId, c.workspaceId),
								eq(ledgerTransaction.accountId, account.id),
								isNull(ledgerTransaction.trashedAt),
								gt(ledgerTransaction.date, account.openingDate)
							)
						);
					let resulting =
						account.openingBalanceMinor +
						remaining.reduce(
							(sum, row) => sum + (row.kind === 'expense' ? -row.amount : row.amount),
							0n
						);
					const corrections = await tx
						.select({ amount: ledgerBalanceCorrection.amountMinor })
						.from(ledgerBalanceCorrection)
						.where(
							and(
								eq(ledgerBalanceCorrection.workspaceId, c.workspaceId),
								eq(ledgerBalanceCorrection.accountId, account.id),
								isNull(ledgerBalanceCorrection.trashedAt),
								gt(ledgerBalanceCorrection.date, account.openingDate)
							)
						);
					resulting += corrections.reduce((sum, row) => sum + BigInt(row.amount), 0n);
					if (resulting < -(1n << 63n) || resulting > (1n << 63n) - 1n)
						throw new LedgerError(
							'invalid',
							'Trashing import would put the account balance outside int64 range'
						);
					await audit(tx, c, 'import_batch', id, 'trash', batch, batchUpdate[0]);
					return { trashed: rows.length };
				});
			});
		}
	};
}
export type InsightsRepository = ReturnType<typeof createInsightsRepository>;
