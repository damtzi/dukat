import { ProfileImageError, type ProfileImageCrop } from '@dukat/api';
import sharp from 'sharp';

import {
	MAX_PROFILE_IMAGE_PIXELS,
	PROFILE_IMAGE_OUTPUT_SIZE,
	profileImageCropRegion,
	validateProfileImageCrop,
	validateProfileImageDimensions,
	validateProfileImageSource
} from './profile-image-policy';

export async function normalizeProfileImage(source: Uint8Array, crop: ProfileImageCrop) {
	validateProfileImageSource(source);
	validateProfileImageCrop(crop);

	let metadata: sharp.Metadata;
	try {
		metadata = await sharp(source, {
			animated: true,
			failOn: 'error',
			limitInputPixels: MAX_PROFILE_IMAGE_PIXELS
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
	validateProfileImageDimensions(metadata.width ?? 0, metadata.height ?? 0);

	try {
		const oriented = await sharp(source, {
			animated: false,
			failOn: 'error',
			limitInputPixels: MAX_PROFILE_IMAGE_PIXELS
		})
			.rotate()
			.toBuffer({ resolveWithObject: true });
		const region = profileImageCropRegion(oriented.info.width, oriented.info.height, crop);
		return await sharp(oriented.data)
			.extract(region)
			.resize(PROFILE_IMAGE_OUTPUT_SIZE, PROFILE_IMAGE_OUTPUT_SIZE)
			.webp({ quality: 85 })
			.toBuffer();
	} catch (error) {
		if (error instanceof ProfileImageError) throw error;
		throw new ProfileImageError(400, 'The selected file is not a valid image.');
	}
}
