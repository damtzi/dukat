export const RESERVED_USERNAMES = new Set([
	'admin',
	'administrator',
	'support',
	'security',
	'system',
	'dukat'
]);

export function normalizeUsername(value: string) {
	return value.trim().toLowerCase();
}

export function usernameValidationMessage(username: string): string | undefined {
	if (username.length < 3 || username.length > 30) {
		return 'Username must be 3–30 characters long.';
	}
	if (!/^[a-z][a-z0-9_]*$/.test(username)) {
		return 'Username must start with a letter and use only lowercase letters, numbers, or underscores.';
	}
	if (RESERVED_USERNAMES.has(username)) {
		return 'That username is reserved.';
	}
}

export function normalizeName(value: string) {
	return value.trim();
}

export function nameValidationMessage(name: string): string | undefined {
	const length = Array.from(name).length;
	if (length < 1 || length > 100) return 'Name must be 1–100 characters long.';
	if (/\p{C}/u.test(name)) {
		return 'Name cannot contain control characters or other non-printable characters.';
	}
}
