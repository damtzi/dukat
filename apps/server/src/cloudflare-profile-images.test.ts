import assert from 'node:assert/strict';
import test from 'node:test';

import { createR2ProfileImageStorage } from './cloudflare-profile-images';

test('R2 profile-image storage uses same-origin user-scoped objects', async () => {
	const writes: Array<{ key: string; image: Uint8Array }> = [];
	const deleted: string[] = [];
	const storage = createR2ProfileImageStorage({
		async put(key, image) {
			writes.push({ key, image });
		},
		async delete(key) {
			deleted.push(key);
		}
	});

	const url = await storage.store('user-1', new Uint8Array([1, 2, 3]));
	assert.match(url, /^\/profile-images\/users\/[A-Za-z0-9_-]+\/\d+-[0-9a-f-]+\.webp$/);
	assert.equal(writes[0].key, url.slice('/profile-images/'.length));
	assert.deepEqual(writes[0].image, new Uint8Array([1, 2, 3]));

	await storage.remove('another-user', url);
	assert.deepEqual(deleted, []);
	await storage.remove('user-1', url);
	assert.deepEqual(deleted, [writes[0].key]);
});
