import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { requestJson } from './index';

test('uses the injected fetch and checks a JSON response', async () => {
	let request: { input: string | URL | Request; init?: RequestInit } | undefined;
	const fetcher: typeof fetch = async (input, init) => {
		request = { input, init };
		return Response.json({ amountMinor: '42' });
	};

	const result = await requestJson(fetcher, '/api/ledger', z.object({ amountMinor: z.string() }), {
		method: 'POST',
		body: '{}'
	});

	assert.deepEqual(result, { amountMinor: '42' });
	assert.equal(request?.input, '/api/ledger');
	assert.equal(new Headers(request?.init?.headers).get('content-type'), 'application/json');
});

test('rejects an incompatible response contract', async () => {
	const fetcher: typeof fetch = async () => Response.json({ amountMinor: 42 });

	await assert.rejects(() =>
		requestJson(fetcher, '/api/ledger', z.object({ amountMinor: z.string() }))
	);
});

test('preserves API errors and empty responses', async () => {
	const conflict: typeof fetch = async () =>
		new Response(JSON.stringify({ message: 'Account changed' }), {
			status: 409,
			headers: { 'content-type': 'application/json' }
		});
	await assert.rejects(() => requestJson(conflict, '/api/ledger'), {
		message: 'Account changed'
	});

	const empty: typeof fetch = async () => new Response(null, { status: 204 });
	assert.equal(await requestJson(empty, '/api/ledger'), null);
});
