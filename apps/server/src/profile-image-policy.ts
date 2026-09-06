import { ProfileImageError, type ProfileImageCrop } from '@dukat/api';

export const MAX_PROFILE_IMAGE_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_IMAGE_DIMENSION = 4096;
export const MAX_PROFILE_IMAGE_PIXELS = 16_777_216;
export const PROFILE_IMAGE_OUTPUT_SIZE = 512;

export function validateProfileImageSource(source: Uint8Array) {
	if (source.byteLength > MAX_PROFILE_IMAGE_SOURCE_BYTES) {
		throw new ProfileImageError(413, 'Profile images must be 5 MB or smaller.');
	}
}

export function validateProfileImageCrop(crop: ProfileImageCrop) {
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

export function validateProfileImageDimensions(width: number, height: number) {
	if (
		!width ||
		!height ||
		width > MAX_PROFILE_IMAGE_DIMENSION ||
		height > MAX_PROFILE_IMAGE_DIMENSION ||
		width * height > MAX_PROFILE_IMAGE_PIXELS
	) {
		throw new ProfileImageError(400, 'Image dimensions are too large.');
	}
}

export function profileImageCropRegion(width: number, height: number, crop: ProfileImageCrop) {
	const size = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom));
	return {
		left: Math.round((width - size) * crop.x),
		top: Math.round((height - size) * crop.y),
		width: size,
		height: size
	};
}
