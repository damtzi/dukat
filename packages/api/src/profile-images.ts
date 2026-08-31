import sharp from 'sharp';

import type { AuthenticationService } from './services';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_777_216;
const OUTPUT_SIZE = 512;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export interface ProfileImageStorage {
	store(userId: string, image: Uint8Array): Promise<string>;
	remove(userId: string, publicUrl: string): Promise<void>;
}

export interface ProfileImageCrop {
	x: number;
	y: number;
	zoom: number;
}

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

function validCrop(crop: ProfileImageCrop) {
	if (
		!Number.isFinite(crop.x) ||
		!Number.isFinite(crop.y) ||
		!Number.isFinite(crop.zoom) ||
		crop.x < 0 ||
		crop.x > 1 ||
		crop.y < 0 ||
		crop.y > 1 ||
		crop.zoom < 1 ||
		crop.zoom > 3
	) {
		throw new ProfileImageError(400, 'Crop controls are invalid.');
	}
}

async function normalizeImage(source: Uint8Array, crop: ProfileImageCrop) {
	if (source.byteLength > MAX_SOURCE_BYTES) {
		throw new ProfileImageError(413, 'Profile images must be 5 MB or smaller.');
	}
	validCrop(crop);

	let metadata: sharp.Metadata;
	try {
		metadata = await sharp(source, {
			animated: true,
			failOn: 'error',
			limitInputPixels: MAX_PIXELS
		}).metadata();
	} catch (error) {
		if (error instanceof Error && /pixel limit/i.test(error.message)) {
			throw new ProfileImageError(400, 'Image dimensions are too large.');
		}
		throw new ProfileImageError(400, 'The selected file is not a valid image.');
	}

	if ((metadata.pages ?? 1) > 1) {
		throw new ProfileImageError(400, 'Animated images are not supported.');
	}
	if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
		throw new ProfileImageError(400, 'Select a JPEG, PNG, or WebP image.');
	}
	if (
		!metadata.width ||
		!metadata.height ||
		metadata.width > MAX_DIMENSION ||
		metadata.height > MAX_DIMENSION ||
		metadata.width * metadata.height > MAX_PIXELS
	) {
		throw new ProfileImageError(400, 'Image dimensions are too large.');
	}

	try {
		const oriented = await sharp(source, {
			animated: false,
			failOn: 'error',
			limitInputPixels: MAX_PIXELS
		})
			.rotate()
			.toBuffer({ resolveWithObject: true });
		const square = Math.max(
			1,
			Math.floor(Math.min(oriented.info.width, oriented.info.height) / crop.zoom)
		);
		const left = Math.round((oriented.info.width - square) * crop.x);
		const top = Math.round((oriented.info.height - square) * crop.y);
		return await sharp(oriented.data)
			.extract({ left, top, width: square, height: square })
			.resize(OUTPUT_SIZE, OUTPUT_SIZE)
			.webp({ quality: 85 })
			.toBuffer();
	} catch (error) {
		if (error instanceof ProfileImageError) throw error;
		throw new ProfileImageError(400, 'The selected file is not a valid image.');
	}
}

export function createProfileImageService(options: {
	auth: AuthenticationService;
	storage: ProfileImageStorage;
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

	async function ignoreCleanupFailure(userId: string, publicUrl: string | null) {
		if (!publicUrl) return;
		try {
			await options.storage.remove(userId, publicUrl);
		} catch {
			// Durable cleanup retry is delivered separately.
		}
	}

	return {
		async replace(input) {
			consume(input.userId);
			const normalized = await normalizeImage(input.source, input.crop);
			const publicUrl = await options.storage.store(input.userId, normalized);
			try {
				await setProfileImage(input.userId, publicUrl);
			} catch (error) {
				await ignoreCleanupFailure(input.userId, publicUrl);
				throw error;
			}
			await ignoreCleanupFailure(input.userId, input.currentImage);
			return publicUrl;
		},
		async remove(input) {
			consume(input.userId);
			await setProfileImage(input.userId, null);
			await ignoreCleanupFailure(input.userId, input.currentImage);
		}
	} satisfies ProfileImageService;
}
