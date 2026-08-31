import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { ProfileImageStorage } from '@dukat/api';

const PUBLIC_PREFIX = '/profile-images/';

export function createLocalProfileImageStorage(rootDirectory: string): ProfileImageStorage {
	const root = resolve(rootDirectory);
	mkdirSync(root, { recursive: true, mode: 0o700 });

	function pathFor(userId: string, publicUrl: string) {
		const scope = createHash('sha256').update(userId).digest('base64url');
		const userPrefix = `${PUBLIC_PREFIX}users/${scope}/`;
		if (!publicUrl.startsWith(userPrefix)) return null;
		const key = publicUrl.slice(PUBLIC_PREFIX.length);
		const path = resolve(root, key);
		return path.startsWith(`${root}${sep}`) ? path : null;
	}

	return {
		async store(userId, image) {
			const scope = createHash('sha256').update(userId).digest('base64url');
			const key = `users/${scope}/${Date.now()}-${randomUUID()}.webp`;
			const path = join(root, key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, image, { flag: 'wx', mode: 0o600 });
			return `${PUBLIC_PREFIX}${key}`;
		},
		async remove(userId, publicUrl) {
			const path = pathFor(userId, publicUrl);
			if (!path) return;
			await rm(path, { force: true });
		}
	};
}
