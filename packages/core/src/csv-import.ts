import { z } from 'zod';

import {
	calendarDateSchema,
	isoCalendarDateSchema,
	mutationSchema,
	positiveMinorUnitsSchema,
	transactionKindSchema
} from './ledger';

export const DUKAT_CSV_HEADER = 'date,kind,amount,description,category';
export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_ROWS = 10_000;
export const categoryNameSchema = z.string().trim().min(1).max(120);
export const normalizeCategoryName = (name: string) => name.normalize('NFKC').toLowerCase();
export const filenameSchema = z
	.string()
	.trim()
	.min(1)
	.max(255)
	.refine(
		(name) => [...name].every((character) => character >= ' ' && !'/\\'.includes(character)),
		'Filename contains invalid characters'
	);

/** Parse RFC 4180-style CSV, retaining blank fields and rejecting malformed quoting. */
export function parseCsv(text: string): string[][] {
	if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error('CSV is too large');
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let closedQuote = false;
	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				field += '"';
				index++;
			} else if (character === '"') {
				quoted = false;
				closedQuote = true;
			} else {
				field += character;
			}
			continue;
		}
		if (closedQuote && character !== ',' && character !== '\r' && character !== '\n')
			throw new Error('Unexpected character after closing quote');
		if (character === '"') {
			if (field !== '' || closedQuote) throw new Error('Unexpected quote in unquoted field');
			quoted = true;
		} else if (character === ',') {
			row.push(field);
			field = '';
			closedQuote = false;
		} else if (character === '\n') {
			row.push(field);
			rows.push(row);
			if (rows.length > MAX_CSV_ROWS + 1) throw new Error('CSV has too many rows');
			row = [];
			field = '';
			closedQuote = false;
		} else if (character === '\r') {
			if (text[index + 1] !== '\n') throw new Error('Bare carriage return in CSV');
		} else {
			field += character;
		}
	}
	if (quoted) throw new Error('Unclosed quoted CSV field');
	if (field !== '' || row.length > 0 || closedQuote) {
		row.push(field);
		rows.push(row);
	}
	while (rows.length > 1 && rows.at(-1)?.every((value) => value === '')) rows.pop();
	return rows;
}

export function decimalToMinor(value: string, currency: string): string {
	const digits =
		new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
			.maximumFractionDigits ?? 2;
	if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
		throw new Error('Amount must be a positive decimal');
	const [whole, fraction = ''] = value.split('.');
	if (fraction.length > digits) throw new Error(`Amount has more than ${digits} decimal places`);
	const result =
		BigInt(whole) * 10n ** BigInt(digits) +
		BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0');
	if (result <= 0n || result > (1n << 63n) - 1n)
		throw new Error('Amount is outside the positive int64 range');
	return result.toString();
}

const idSchema = z.string().min(1).max(200);
export const categorySchema = z.object({
	id: idSchema,
	workspaceId: idSchema,
	name: categoryNameSchema,
	version: z.number().int().positive(),
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string()
});
export const categoryActionSchema = z.enum(['delete', 'archive', 'restore']);
export const createCategoryInputSchema = mutationSchema.extend({ name: categoryNameSchema });
export const updateCategoryInputSchema = createCategoryInputSchema.extend({
	version: z.number().int().positive()
});
export const categoryActionInputSchema = mutationSchema.extend({
	version: z.number().int().positive()
});
export const summaryInputSchema = z
	.object({
		startDate: isoCalendarDateSchema,
		endDate: isoCalendarDateSchema,
		accountId: z.union([idSchema, z.array(idSchema).max(100)]).optional()
	})
	.refine((value) => value.startDate <= value.endDate, {
		message: 'Start date must not be after end date'
	});
export const summaryTransactionSchema = z.object({
	id: idSchema,
	accountId: idSchema,
	date: calendarDateSchema,
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	description: z.string().nullable()
});
export const exchangeRateProvenanceSchema = z.object({
	currency: z.string().length(3),
	rateToPln: z.string(),
	source: z.enum(['identity', 'NBP', 'manual']),
	effectiveDate: isoCalendarDateSchema,
	tableNumber: z.string().nullable(),
	manualOverrideId: z.string().nullable(),
	reason: z.string().nullable(),
	actorDisplay: z.string().nullable()
});
export const summarySchema = z.object({
	reporting: z
		.object({
			currency: z.string().length(3),
			incomeMinor: z.string().nullable(),
			spendingMinor: z.string().nullable(),
			uncategorizedMinor: z.string().nullable(),
			missingRate: z.boolean(),
			rates: z.array(exchangeRateProvenanceSchema)
		})
		.optional(),
	currencies: z.array(
		z.object({
			currency: z.string().length(3),
			incomeMinor: z.string(),
			spendingMinor: z.string(),
			uncategorizedMinor: z.string(),
			groups: z.array(
				z.object({
					kind: transactionKindSchema,
					categoryId: idSchema.nullable(),
					categoryName: z.string(),
					amountMinor: z.string(),
					transactions: z.array(summaryTransactionSchema)
				})
			)
		})
	)
});
export const previewInputSchema = z.object({
	filename: filenameSchema,
	accountId: idSchema,
	csv: z.string().min(1).max(MAX_CSV_BYTES)
});
export const previewRowSchema = z.object({
	sourceRow: z
		.number()
		.int()
		.min(2)
		.max(MAX_CSV_ROWS + 1),
	date: z.string(),
	kind: z.string(),
	amount: z.string(),
	amountMinor: z.string(),
	description: z.string(),
	category: z.string(),
	categoryId: idSchema.nullable(),
	categoryStatus: z.enum(['blank', 'existing', 'archived', 'unknown']),
	errors: z.array(z.string()),
	duplicateReason: z.string().nullable(),
	selected: z.boolean()
});
export const previewSchema = z.object({ rows: z.array(previewRowSchema).max(MAX_CSV_ROWS) });
export const confirmInputSchema = previewInputSchema.extend({
	...mutationSchema.shape,
	rows: z
		.array(
			z
				.object({
					sourceRow: z
						.number()
						.int()
						.min(2)
						.max(MAX_CSV_ROWS + 1),
					include: z.boolean(),
					duplicateAcknowledged: z.boolean(),
					categoryId: idSchema.nullable().optional(),
					createCategory: categoryNameSchema.optional()
				})
				.refine((row) => !(row.categoryId && row.createCategory), {
					message: 'Choose either an existing or new category'
				})
		)
		.min(1)
		.max(MAX_CSV_ROWS)
});
export const importBatchSchema = z.object({
	id: idSchema,
	workspaceId: idSchema,
	accountId: idSchema,
	filename: filenameSchema,
	actorUserId: idSchema.nullable(),
	createdAt: z.string(),
	trashedAt: z.string().nullable()
});
export const importTransactionSchema = z.object({
	id: idSchema,
	workspaceId: idSchema,
	accountId: idSchema,
	categoryId: idSchema.nullable(),
	importBatchId: idSchema,
	importSourceRow: z.number().int().min(2),
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	date: calendarDateSchema,
	description: z.string().nullable(),
	source: z.literal('manual'),
	transferId: z.null(),
	transferSide: z.null(),
	version: z.number().int().positive(),
	trashedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string()
});
export const importDetailSchema = importBatchSchema.extend({
	transactions: z.array(importTransactionSchema)
});
export const trashImportInputSchema = mutationSchema;

export type Category = z.infer<typeof categorySchema>;
export type Summary = z.infer<typeof summarySchema>;
export type CsvPreview = z.infer<typeof previewSchema>;
export type CsvPreviewRow = z.infer<typeof previewRowSchema>;
export type CsvConfirmInput = z.infer<typeof confirmInputSchema>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type ImportDetail = z.infer<typeof importDetailSchema>;
