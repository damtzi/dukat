import {
	ProfileImageError,
	type ProfileImageNormalizer,
	type ProfileImageStorage
} from '@dukat/api';

import {
	PROFILE_IMAGE_OUTPUT_SIZE,
	profileImageCropRegion,
	validateProfileImageCrop,
	validateProfileImageDimensions,
	validateProfileImageSource
} from './profile-image-policy';

const PUBLIC_PREFIX = '/profile-images/';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface ProfileImageBucket {
	put(
		key: string,
		value: Uint8Array,
		options: { httpMetadata: { cacheControl: string; contentType: string } }
	): Promise<unknown>;
	delete(key: string): Promise<void>;
}

interface ImagesBinding {
	info(
		stream: ReadableStream<Uint8Array>
	): Promise<
		| { format: 'image/svg+xml' }
		| { format: string; fileSize: number; width: number; height: number }
	>;
	input(stream: ReadableStream<Uint8Array>): {
		transform(options: object): ReturnType<ImagesBinding['input']>;
		output(options: {
			format: 'image/webp';
			quality: number;
			anim: false;
		}): Promise<{ response(): Response }>;
	};
}

function stream(bytes: Uint8Array) {
	return new Blob([bytes as BlobPart]).stream();
}

async function userScope(userId: string) {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
	);
	const base64 = btoa(String.fromCharCode(...digest));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createCloudflareProfileImageNormalizer(
	images: ImagesBinding
): ProfileImageNormalizer {
	return async (source, crop) => {
		validateProfileImageSource(source);
		validateProfileImageCrop(crop);

		let info: Awaited<ReturnType<ImagesBinding['info']>>;
		try {
			info = await images.info(stream(source));
		} catch {
			throw new ProfileImageError(400, 'The selected file is not a valid image.');
		}
		if (!('width' in info) || !['image/jpeg', 'image/png', 'image/webp'].includes(info.format)) {
			throw new ProfileImageError(400, 'Select a JPEG, PNG, or WebP image.');
		}
		validateProfileImageDimensions(info.width, info.height);

		const region = profileImageCropRegion(info.width, info.height, crop);
		try {
			const result = await images
				.input(stream(source))
				.transform({ trim: region })
				.transform({
					width: PROFILE_IMAGE_OUTPUT_SIZE,
					height: PROFILE_IMAGE_OUTPUT_SIZE,
					fit: 'cover'
				})
				.output({ format: 'image/webp', quality: 85, anim: false });
			return new Uint8Array(await result.response().arrayBuffer());
		} catch {
			throw new ProfileImageError(400, 'The selected file is not a valid image.');
		}
	};
}

export function createR2ProfileImageStorage(bucket: ProfileImageBucket): ProfileImageStorage {
	return {
		async store(userId, image) {
			const key = `users/${await userScope(userId)}/${Date.now()}-${crypto.randomUUID()}.webp`;
			await bucket.put(key, image, {
				httpMetadata: { cacheControl: CACHE_CONTROL, contentType: 'image/webp' }
			});
			return `${PUBLIC_PREFIX}${key}`;
		},
		async remove(userId, publicUrl) {
			const pathname = publicUrl.startsWith('/') ? publicUrl : new URL(publicUrl).pathname;
			const prefix = `${PUBLIC_PREFIX}users/${await userScope(userId)}/`;
			if (!pathname.startsWith(prefix)) return;
			await bucket.delete(pathname.slice(PUBLIC_PREFIX.length));
		}
	};
}
