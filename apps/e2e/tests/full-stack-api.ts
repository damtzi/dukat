import { randomUUID } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// Replace only the external mail transport. Auth, tokens, outbox and HTTP stay real.
const directory = process.env.FULL_STACK_MAIL_DIRECTORY;
if (process.env.NODE_ENV !== 'test' || !directory) {
	throw new Error('The full-stack mail sink requires the isolated test environment.');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url !== 'https://api.resend.com/emails') return originalFetch(input, init);
	const file = join(directory, randomUUID());
	await writeFile(`${file}.tmp`, String(init?.body), { mode: 0o600 });
	await rename(`${file}.tmp`, `${file}.json`);
	return Response.json({ id: randomUUID() });
};

const { startupJobs } = await import('../../server/src/app');
await startupJobs;
await import('../../server/src/index');
