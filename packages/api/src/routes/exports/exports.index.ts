import type { CsvExport } from '@dukat/db/repositories/exports';

import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';

const router = createRouter();
router.use('/exports/*', authenticated);

const encoder = new TextEncoder();
function stream(source: AsyncIterable<string>) {
	const iterator = source[Symbol.asyncIterator]();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const next = await iterator.next();
			if (next.done) controller.close();
			else controller.enqueue(encoder.encode(next.value));
		},
		async cancel() {
			await iterator.return?.();
		}
	});
}

const headers = (filename: string, contentType: string) => ({
	'Content-Type': contentType,
	'Content-Disposition': `attachment; filename="${filename}"`,
	'Cache-Control': 'private, no-store',
	'X-Content-Type-Options': 'nosniff'
});
const date = () => new Date().toISOString().slice(0, 10);

export const exportsRouter = router
	.get('/exports/complete.json', (c) => {
		const exports = c.var.services.exports;
		if (!exports) throw new Error('Export service is unavailable');
		return c.body(stream(exports.completeJson(c.var.userId)), 200, {
			...headers(`dukat-complete-${date()}.json`, 'application/json; charset=utf-8')
		});
	})
	.get('/exports/:file', (c) => {
		const exports = c.var.services.exports;
		if (!exports) throw new Error('Export service is unavailable');
		const file = c.req.param('file') ?? '';
		const name = file.endsWith('.csv') ? file.slice(0, -4) : '';
		if (!['transactions', 'balances', 'budgets', 'future-holdings'].includes(name))
			return c.json({ message: 'Export not found' }, 404);
		return c.body(stream(exports.csv(c.var.userId, name as CsvExport)), 200, {
			...headers(`dukat-${name}-${date()}.csv`, 'text/csv; charset=utf-8')
		});
	});
