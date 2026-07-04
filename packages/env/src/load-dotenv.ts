import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { config } from 'dotenv';

let loaded = false;

export function loadDotenv() {
	if (loaded) {
		return;
	}

	loaded = true;

	let currentDirectory = process.cwd();

	while (true) {
		const envPath = join(currentDirectory, '.env');

		if (existsSync(envPath)) {
			config({ path: envPath });
		}

		const parentDirectory = dirname(currentDirectory);

		if (parentDirectory === currentDirectory) {
			break;
		}

		currentDirectory = parentDirectory;
	}
}
