import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createServerEnv } from '@dukat/env/server';

import { createServerApp } from './create-server-app';
import { createProfileImageStorage, createS3ProfileImageStorage } from './profile-image-storage';

test('S3 profile-image storage uses public user-scoped versioned objects', async () => {
	const commands: unknown[] = [];
	const storage = createS3ProfileImageStorage({
		bucket: 'dukat-profile-images',
		publicBaseUrl: 'https://images.example.com',
		client: {
			async send(command) {
				commands.push(command);
				return {};
			}
		},
		now: () => 1_725_000_000_000,
		randomUUID: () => '5a1eb680-f7ed-4ae9-8d49-1f41fe9fa007'
	});
	const image = new Uint8Array([1, 2, 3]);
	const scope = createHash('sha256').update('user-1').digest('base64url');
	const key = `users/${scope}/1725000000000-5a1eb680-f7ed-4ae9-8d49-1f41fe9fa007.webp`;

	const publicUrl = await storage.store('user-1', image);

	assert.equal(publicUrl, `https://images.example.com/${key}`);
	assert.equal(commands[0] instanceof PutObjectCommand, true);
	assert.deepEqual((commands[0] as PutObjectCommand).input, {
		Bucket: 'dukat-profile-images',
		Key: key,
		Body: image,
		CacheControl: 'public, max-age=31536000, immutable',
		ContentType: 'image/webp'
	});

	await storage.remove('user-1', publicUrl);
	assert.equal(commands[1] instanceof DeleteObjectCommand, true);
	assert.deepEqual((commands[1] as DeleteObjectCommand).input, {
		Bucket: 'dukat-profile-images',
		Key: key
	});

	await storage.remove('another-user', publicUrl);
	await storage.remove('user-1', `https://backups.example.com/${key}`);
	await storage.remove('user-1', `${publicUrl}?version=other`);
	assert.equal(commands.length, 2);
	assert.throws(
		() =>
			createS3ProfileImageStorage({
				bucket: 'dukat-profile-images',
				publicBaseUrl: 'https://images.example.com/profile-images',
				client: { async send() {} }
			}),
		/Profile-image public base URL must be an origin/
	);
});

test('profile-image storage selects local storage outside production without cloud credentials', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-images-selection-'));
	try {
		const configured = createProfileImageStorage({
			nodeEnv: 'development',
			localDirectory: directory
		});
		const publicUrl = await configured.storage.store('user-1', new Uint8Array([1]));

		assert.equal(configured.publicOrigin, undefined);
		assert.equal(configured.localDirectory, directory);
		assert.match(publicUrl, /^\/profile-images\/users\//);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('profile-image storage selects S3 in production', async () => {
	const commands: unknown[] = [];
	const configured = createProfileImageStorage(
		{
			nodeEnv: 'production',
			localDirectory: './unused',
			s3: {
				endpoint: 'https://s3.eu-central-1.example.com',
				region: 'eu-central-1',
				accessKeyId: 'profile-images-access-key',
				secretAccessKey: 'profile-images-secret-key',
				bucket: 'dukat-profile-images',
				publicBaseUrl: 'https://images.example.com'
			}
		},
		{
			async send(command) {
				commands.push(command);
				return {};
			}
		}
	);

	const publicUrl = await configured.storage.store('user-1', new Uint8Array([1]));
	assert.equal(configured.localDirectory, undefined);
	assert.equal(configured.publicOrigin, 'https://images.example.com');
	assert.match(publicUrl, /^https:\/\/images\.example\.com\/users\//);
	assert.equal(commands[0] instanceof PutObjectCommand, true);
});

test('production configuration requires valid dedicated profile-image storage', () => {
	assert.throws(
		() =>
			createServerEnv({
				NODE_ENV: 'production',
				DASHBOARD_DIRECTORY: '/srv/dukat/dashboard'
			}),
		/PROFILE_IMAGE_S3_ENDPOINT.*PROFILE_IMAGE_S3_REGION.*PROFILE_IMAGE_S3_ACCESS_KEY_ID.*PROFILE_IMAGE_S3_SECRET_ACCESS_KEY.*PROFILE_IMAGE_S3_BUCKET.*PROFILE_IMAGE_PUBLIC_BASE_URL/
	);
	assert.throws(
		() =>
			createServerEnv({
				NODE_ENV: 'production',
				DASHBOARD_DIRECTORY: '/srv/dukat/dashboard',
				PROFILE_IMAGE_S3_ENDPOINT: 'not-an-endpoint',
				PROFILE_IMAGE_S3_REGION: 'eu-central-1',
				PROFILE_IMAGE_S3_ACCESS_KEY_ID: 'profile-images-access-key',
				PROFILE_IMAGE_S3_SECRET_ACCESS_KEY: 'profile-images-secret-key',
				PROFILE_IMAGE_S3_BUCKET: 'dukat-profile-images',
				PROFILE_IMAGE_PUBLIC_BASE_URL: 'http://images.example.com/profile-images'
			}),
		/PROFILE_IMAGE_S3_ENDPOINT.*PROFILE_IMAGE_PUBLIC_BASE_URL/
	);
	assert.throws(
		() =>
			createServerEnv({
				NODE_ENV: 'production',
				DASHBOARD_DIRECTORY: '/srv/dukat/dashboard',
				PROFILE_IMAGE_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
				PROFILE_IMAGE_S3_REGION: 'auto',
				PROFILE_IMAGE_S3_ACCESS_KEY_ID: 'profile-images-access-key',
				PROFILE_IMAGE_S3_SECRET_ACCESS_KEY: 'profile-images-secret-key',
				PROFILE_IMAGE_S3_BUCKET: 'dukat-profile-images',
				PROFILE_IMAGE_PUBLIC_BASE_URL: 'https://images.example.com/profile-images'
			}),
		/PROFILE_IMAGE_PUBLIC_BASE_URL/
	);
});

test('development configuration does not require cloud credentials', () => {
	const env = createServerEnv({ NODE_ENV: 'development' });

	assert.equal(env.PROFILE_IMAGE_DIRECTORY, './data/profile-images');
	assert.equal(env.PROFILE_IMAGE_S3_SECRET_ACCESS_KEY, undefined);
});

test('production requires matching dashboard and server profile-image origins', async () => {
	const dashboard = await mkdtemp(join(tmpdir(), 'dukat-dashboard-csp-'));
	try {
		await writeFile(
			join(dashboard, 'index.html'),
			'<meta http-equiv="content-security-policy" content="img-src \'self\' data: blob: https://images.example.com">'
		);
		const app = createServerApp({
			api: { fetch: () => Response.json({ ok: true }) },
			dashboardDirectory: dashboard,
			isProduction: true,
			profileImageOrigin: 'https://images.example.com'
		});

		const response = await app.request('https://dukat.example/api/health/live');
		const policy = response.headers.get('content-security-policy') ?? '';
		assert.match(policy, /img-src 'self' data: blob: https:\/\/images\.example\.com/);
		assert.doesNotMatch(policy, /s3\.eu-central-1\.example\.com|backups|\*/);
		assert.match(policy, /frame-ancestors 'none'/);
		assert.throws(
			() =>
				createServerApp({
					api: { fetch: () => Response.json({ ok: true }) },
					dashboardDirectory: dashboard,
					isProduction: true,
					profileImageOrigin: 'https://other-images.example.com'
				}),
			/Dashboard CSP does not permit https:\/\/other-images\.example\.com/
		);
	} finally {
		await rm(dashboard, { recursive: true, force: true });
	}
});
