import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { ProfileImageStorage } from '@dukat/api';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const PUBLIC_PREFIX = '/profile-images/';
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

interface S3ClientLike {
	send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

interface S3ProfileImageStorageOptions {
	bucket: string;
	publicBaseUrl: string;
	client: S3ClientLike;
	now?: () => number;
	randomUUID?: () => string;
}

interface ProfileImageStorageConfig {
	nodeEnv: 'development' | 'test' | 'production';
	localDirectory: string;
	s3?: {
		endpoint: string;
		region: string;
		accessKeyId: string;
		secretAccessKey: string;
		bucket: string;
		publicBaseUrl: string;
	};
}

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

export function createS3ProfileImageStorage(
	options: S3ProfileImageStorageOptions
): ProfileImageStorage {
	const publicUrl = new URL(options.publicBaseUrl);
	if (
		publicUrl.pathname !== '/' ||
		publicUrl.search ||
		publicUrl.hash ||
		publicUrl.username ||
		publicUrl.password
	) {
		throw new Error('Profile-image public base URL must be an origin.');
	}
	const publicOrigin = publicUrl.origin;
	const now = options.now ?? Date.now;
	const uuid = options.randomUUID ?? randomUUID;

	return {
		async store(userId, image) {
			const scope = createHash('sha256').update(userId).digest('base64url');
			const key = `users/${scope}/${now()}-${uuid()}.webp`;
			await options.client.send(
				new PutObjectCommand({
					Bucket: options.bucket,
					Key: key,
					Body: image,
					CacheControl: PUBLIC_CACHE_CONTROL,
					ContentType: 'image/webp'
				})
			);
			return `${publicOrigin}/${key}`;
		},
		async remove(userId, publicUrl) {
			const scope = createHash('sha256').update(userId).digest('base64url');
			let parsedUrl: URL;
			try {
				parsedUrl = new URL(publicUrl);
			} catch {
				return;
			}
			const userPrefix = `/users/${scope}/`;
			if (
				parsedUrl.origin !== publicOrigin ||
				!parsedUrl.pathname.startsWith(userPrefix) ||
				parsedUrl.search ||
				parsedUrl.hash
			) {
				return;
			}
			const key = parsedUrl.pathname.slice(1);
			await options.client.send(
				new DeleteObjectCommand({
					Bucket: options.bucket,
					Key: key
				})
			);
		}
	};
}

export function createProfileImageStorage(
	config: ProfileImageStorageConfig,
	client?: S3ClientLike
): {
	storage: ProfileImageStorage;
	localDirectory?: string;
	publicOrigin?: string;
} {
	if (config.nodeEnv !== 'production') {
		return {
			storage: createLocalProfileImageStorage(config.localDirectory),
			localDirectory: config.localDirectory
		};
	}
	if (!config.s3) {
		throw new Error('S3 profile-image storage configuration is required in production.');
	}

	const s3Client =
		client ??
		new S3Client({
			endpoint: config.s3.endpoint,
			region: config.s3.region,
			credentials: {
				accessKeyId: config.s3.accessKeyId,
				secretAccessKey: config.s3.secretAccessKey
			},
			forcePathStyle: true
		});
	return {
		storage: createS3ProfileImageStorage({
			client: s3Client,
			bucket: config.s3.bucket,
			publicBaseUrl: config.s3.publicBaseUrl
		}),
		publicOrigin: new URL(config.s3.publicBaseUrl).origin
	};
}
