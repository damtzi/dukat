import type { AuthenticationService } from './services';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export interface ProfileImageStorage {
	store(userId: string, image: Uint8Array): Promise<string>;
	remove(userId: string, publicUrl: string): Promise<void>;
}

export interface ProfileImageCleanupService {
	enqueue(userId: string, publicUrl: string): Promise<void>;
	drain(): Promise<void>;
}

export interface ProfileImageCrop {
	x: number;
	y: number;
	zoom: number;
}

export type ProfileImageNormalizer = (
	source: Uint8Array,
	crop: ProfileImageCrop
) => Promise<Uint8Array>;

export interface ProfileImageService {
	replace(input: {
		userId: string;
		currentImage: string | null;
		source: Uint8Array;
		crop: ProfileImageCrop;
	}): Promise<string>;
	remove(input: { userId: string; currentImage: string | null }): Promise<void>;
}

export class ProfileImageError extends Error {
	constructor(
		readonly status: 400 | 413 | 429,
		message: string
	) {
		super(message);
		this.name = 'ProfileImageError';
	}
}

export function createProfileImageService(options: {
	auth: AuthenticationService;
	storage: ProfileImageStorage;
	cleanup: ProfileImageCleanupService;
	normalize: ProfileImageNormalizer;
	now?: () => number;
}) {
	if (!options.auth.setProfileImage) {
		throw new Error('Authentication service must support profile image updates.');
	}
	const setProfileImage = options.auth.setProfileImage;
	const attempts = new Map<string, number[]>();
	const now = options.now ?? Date.now;

	function consume(userId: string) {
		const cutoff = now() - RATE_LIMIT_WINDOW_MS;
		const recent = (attempts.get(userId) ?? []).filter((timestamp) => timestamp > cutoff);
		if (recent.length >= RATE_LIMIT_MAX) {
			throw new ProfileImageError(
				429,
				'Too many profile image changes. Wait a moment and try again.'
			);
		}
		recent.push(now());
		attempts.set(userId, recent);
	}

	async function drainCleanup() {
		try {
			await options.cleanup.drain();
		} catch {
			// The durable jobs remain available for a later drain.
		}
	}

	return {
		async replace(input) {
			consume(input.userId);
			const normalized = await options.normalize(input.source, input.crop);
			const publicUrl = await options.storage.store(input.userId, normalized);
			try {
				await setProfileImage(input.userId, publicUrl);
			} catch (error) {
				await options.cleanup.enqueue(input.userId, publicUrl);
				await drainCleanup();
				throw error;
			}
			await drainCleanup();
			return publicUrl;
		},
		async remove(input) {
			consume(input.userId);
			await setProfileImage(input.userId, null);
			await drainCleanup();
		}
	} satisfies ProfileImageService;
}
