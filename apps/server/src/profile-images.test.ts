import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	createAPI,
	createProfileImageService,
	type APIServices,
	type AuthenticationService,
	type ProfileImageStorage
} from '@dukat/api';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createDatabase } from '@dukat/db/connection';
import { createProfileImageCleanupRepository } from '@dukat/db/repositories/profile-image-cleanup';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { profileImageCleanupJob, user } from '@dukat/db/schema/auth';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { Hono } from 'hono';
import sharp from 'sharp';

import { createServerApp } from './create-server-app';
import { createProfileImageCleanup } from './profile-image-cleanup';
import {
	createLocalProfileImageStorage,
	createS3ProfileImageStorage
} from './profile-image-storage';

const origin = 'http://localhost:9999';
const portalOrigin = 'https://dukat-portal.example';
const sessionHeaders = { cookie: 'session=test', origin };
const migrationsFolder = fileURLToPath(
	new URL('../../../packages/db/src/migrations', import.meta.url)
);

function createServices(
	storage: ProfileImageStorage,
	updateImage?: (image: string | null) => Promise<void>
): APIServices {
	let image: string | null = null;
	const jobs: Array<{ id: string; userId: string; publicUrl: string }> = [];
	const cleanup = createProfileImageCleanup({
		storage,
		repository: {
			async enqueue(userId, publicUrl) {
				if (!jobs.some((job) => job.userId === userId && job.publicUrl === publicUrl)) {
					jobs.push({ id: `job-${jobs.length + 1}`, userId, publicUrl });
				}
			},
			async listPending() {
				return [...jobs];
			},
			async complete(id) {
				jobs.splice(
					jobs.findIndex((job) => job.id === id),
					1
				);
			},
			async markFailed() {}
		}
	});
	const auth: AuthenticationService = {
		async handler() {
			return new Response(null, { status: 404 });
		},
		async setProfileImage(_userId, nextImage) {
			if (updateImage) await updateImage(nextImage);
			if (image && image !== nextImage) await cleanup.enqueue(_userId, image);
			image = nextImage;
		},
		async usernameAvailability(username) {
			return { available: true, username, message: 'Username is available.' };
		},
		api: {
			async getSession({ headers }) {
				return headers.get('cookie') === 'session=test'
					? {
							user: {
								id: 'user-1',
								name: 'Image User',
								username: 'image_user',
								email: 'image@example.com',
								emailVerified: true,
								image
							}
						}
					: null;
			},
			async verifyPassword() {}
		}
	};
	return {
		auth,
		trustedOrigins: [`${portalOrigin}/`],
		profileImageCleanup: cleanup,
		profileImages: createProfileImageService({ auth, storage, cleanup }),
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {} as APIServices['workspaces']
	};
}

async function upload(
	app: { request(input: string, init?: RequestInit): Response | Promise<Response> },
	source: Uint8Array,
	name: string
) {
	const form = new FormData();
	const bytes = source.buffer.slice(
		source.byteOffset,
		source.byteOffset + source.byteLength
	) as ArrayBuffer;
	form.set('image', new File([bytes], name));
	form.set('x', '0.5');
	form.set('y', '0.5');
	form.set('zoom', '1');
	return app.request(`${origin}/api/profile/image`, {
		method: 'POST',
		headers: sessionHeaders,
		body: form
	});
}

test('profile image HTTP flow normalizes, replaces, serves, and removes images', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-images-'));
	const dashboard = await mkdtemp(join(tmpdir(), 'dukat-dashboard-'));
	try {
		const storage = createLocalProfileImageStorage(directory);
		const configured = createServices(storage);
		const app = createServerApp({
			api: createAPI(configured),
			dashboardDirectory: dashboard,
			profileImagesDirectory: directory
		});
		const source = await sharp({
			create: { width: 4, height: 2, channels: 3, background: 'red' }
		})
			.withMetadata({ orientation: 6 })
			.jpeg()
			.toBuffer();
		const uploaded = await upload(app, source, 'image.jpg');
		assert.equal(uploaded.status, 200, await uploaded.clone().text());
		const first = (await uploaded.json()) as { image: string };
		assert.match(first.image, /^\/profile-images\/users\/[A-Za-z0-9_-]+\/\d+-[0-9a-f-]+\.webp$/);
		await storage.remove('another-user', first.image);

		const publicResponse = await app.request(`${origin}${first.image}`);
		assert.equal(publicResponse.status, 200);
		assert.equal(publicResponse.headers.get('content-type'), 'image/webp');
		assert.match(publicResponse.headers.get('cache-control') ?? '', /immutable/);
		const normalized = await sharp(await publicResponse.arrayBuffer()).metadata();
		assert.deepEqual(
			{
				format: normalized.format,
				width: normalized.width,
				height: normalized.height,
				pages: normalized.pages ?? 1
			},
			{ format: 'webp', width: 512, height: 512, pages: 1 }
		);
		assert.equal(normalized.exif, undefined);

		const replacementResponse = await upload(
			app,
			await sharp({ create: { width: 2, height: 4, channels: 3, background: 'blue' } })
				.png()
				.toBuffer(),
			'image.png'
		);
		assert.equal(replacementResponse.status, 200, await replacementResponse.clone().text());
		const replacement = (await replacementResponse.json()) as { image: string };
		assert.notEqual(replacement.image, first.image);
		assert.equal((await app.request(`${origin}${first.image}`)).status, 404);
		const webpResponse = await upload(
			app,
			await sharp({ create: { width: 3, height: 3, channels: 3, background: 'green' } })
				.webp()
				.toBuffer(),
			'image.webp'
		);
		assert.equal(webpResponse.status, 200, await webpResponse.clone().text());
		const webpImage = (await webpResponse.json()) as { image: string };
		assert.equal((await app.request(`${origin}${replacement.image}`)).status, 404);

		const removed = await app.request(`${origin}/api/profile/image`, {
			method: 'DELETE',
			headers: sessionHeaders
		});
		assert.equal(removed.status, 204);
		assert.equal((await app.request(`${origin}${webpImage.image}`)).status, 404);
		const session = await configured.auth.api.getSession({ headers: new Headers(sessionHeaders) });
		assert.equal(session?.user.image, null);
	} finally {
		await Promise.all([
			rm(directory, { recursive: true, force: true }),
			rm(dashboard, { recursive: true, force: true })
		]);
	}
});

test('production storage returns a retrievable public profile image', async () => {
	const objects = new Map<string, Uint8Array>();
	const storage = createS3ProfileImageStorage({
		bucket: 'dukat-profile-images',
		publicBaseUrl: 'https://images.example.com',
		client: {
			async send(command) {
				if (command instanceof PutObjectCommand) {
					objects.set(command.input.Key!, command.input.Body as Uint8Array);
				} else if (command instanceof DeleteObjectCommand) {
					objects.delete(command.input.Key!);
				}
				return {};
			}
		}
	});
	const publicBucket = new Hono();
	publicBucket.get('*', (context) => {
		const object = objects.get(context.req.path.slice(1));
		if (!object) return context.notFound();
		const body = object.buffer.slice(
			object.byteOffset,
			object.byteOffset + object.byteLength
		) as ArrayBuffer;
		return new Response(body, { headers: { 'content-type': 'image/webp' } });
	});
	const app = createAPI(createServices(storage));
	const source = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'red' } })
		.png()
		.toBuffer();

	const response = await upload(app, source, 'image.png');
	assert.equal(response.status, 200, await response.clone().text());
	const identity = (await response.json()) as { image: string };
	assert.match(identity.image, /^https:\/\/images\.example\.com\/users\//);
	const publicResponse = await publicBucket.request(identity.image);
	assert.equal(publicResponse.status, 200);
	const metadata = await sharp(await publicResponse.arrayBuffer()).metadata();
	assert.deepEqual(
		{ format: metadata.format, width: metadata.width, height: metadata.height },
		{ format: 'webp', width: 512, height: 512 }
	);
});

test('profile image HTTP flow rejects unauthorized, cross-origin, malformed, and unsafe uploads', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-images-'));
	const dashboard = await mkdtemp(join(tmpdir(), 'dukat-dashboard-'));
	try {
		const configured = createServices(createLocalProfileImageStorage(directory));
		const app = createServerApp({
			api: createAPI(configured),
			dashboardDirectory: dashboard,
			profileImagesDirectory: directory
		});
		const noSession = new FormData();
		noSession.set('image', new File([new Uint8Array([1])], 'image.png'));
		assert.equal(
			(
				await app.request(`${origin}/api/profile/image`, {
					method: 'POST',
					headers: { origin },
					body: noSession
				})
			).status,
			401
		);
		const crossOrigin = new FormData();
		crossOrigin.set('image', new File([new Uint8Array([1])], 'image.png'));
		assert.equal(
			(
				await app.request(`${origin}/api/profile/image`, {
					method: 'POST',
					headers: { cookie: 'session=test', origin: 'https://attacker.example' },
					body: crossOrigin
				})
			).status,
			403
		);
		assert.equal(
			(
				await app.request(`${origin}/api/profile/image`, {
					method: 'DELETE',
					headers: { origin }
				})
			).status,
			401
		);
		assert.equal(
			(
				await app.request(`${origin}/api/profile/image`, {
					method: 'DELETE',
					headers: { cookie: 'session=test', origin: 'https://attacker.example' }
				})
			).status,
			403
		);
		const portalUpload = new FormData();
		portalUpload.set('image', new File([new Uint8Array([1])], 'image.png'));
		portalUpload.set('x', '0.5');
		portalUpload.set('y', '0.5');
		portalUpload.set('zoom', '1');
		const trustedPortal = await app.request(`${origin}/api/profile/image`, {
			method: 'POST',
			headers: { cookie: 'session=test', origin: portalOrigin },
			body: portalUpload
		});
		assert.equal(trustedPortal.status, 400);
		assert.match(((await trustedPortal.json()) as { message: string }).message, /valid image/i);

		const animationFrames = Buffer.concat([
			Buffer.from([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
			Buffer.from([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255])
		]);
		const animatedGif = await sharp(animationFrames, {
			raw: { width: 2, height: 4, channels: 4, pageHeight: 2 }
		})
			.gif({ delay: [100, 100], loop: 0 })
			.toBuffer();
		const cases: Array<[string, Uint8Array, RegExp]> = [
			['malformed.png', new TextEncoder().encode('not an image'), /valid image/i],
			['animated.gif', animatedGif, /Animated images are not supported/i],
			[
				'image.svg',
				new TextEncoder().encode(
					'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>'
				),
				/JPEG, PNG, or WebP/i
			],
			[
				'wide.png',
				await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'red' } })
					.png()
					.toBuffer(),
				/dimensions/i
			]
		];
		for (const [name, source, message] of cases) {
			const response = await upload(app, source, name);
			assert.equal(response.status, 400, name);
			assert.match(((await response.json()) as { message: string }).message, message);
		}
		const tooLarge = await upload(app, new Uint8Array(5 * 1024 * 1024 + 1), 'large.png');
		assert.equal(tooLarge.status, 413);
		assert.match(((await tooLarge.json()) as { message: string }).message, /5 MB/);
		assert.equal((await upload(app, new Uint8Array(6 * 1024 * 1024), 'oversized.png')).status, 413);
		assert.deepEqual(await readdir(directory), []);
	} finally {
		await Promise.all([
			rm(directory, { recursive: true, force: true }),
			rm(dashboard, { recursive: true, force: true })
		]);
	}
});

test('an identity update failure records the orphan and a later drain removes it', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-images-'));
	try {
		const localStorage = createLocalProfileImageStorage(directory);
		let storageAvailable = false;
		const storage: ProfileImageStorage = {
			store: localStorage.store,
			async remove(userId, publicUrl) {
				if (!storageAvailable) throw new Error('storage unavailable');
				await localStorage.remove(userId, publicUrl);
			}
		};
		const configured = createServices(storage, async () => {
			throw new Error('database unavailable');
		});
		const response = await upload(
			createAPI(configured),
			await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
				.webp()
				.toBuffer(),
			'image.webp'
		);
		assert.equal(response.status, 500);
		let files = await readdir(directory, { recursive: true });
		assert.equal(
			files.some((path) => path.endsWith('.webp')),
			true
		);

		storageAvailable = true;
		await configured.profileImageCleanup!.drain();
		files = await readdir(directory, { recursive: true });
		assert.equal(
			files.some((path) => path.endsWith('.webp')),
			false
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('replacement and removal complete before failed cleanup retries on a later drain', async () => {
	let version = 0;
	let storageAvailable = false;
	const objects = new Set<string>();
	const storage: ProfileImageStorage = {
		async store() {
			const publicUrl = `/profile-images/users/scope/version-${++version}.webp`;
			objects.add(publicUrl);
			return publicUrl;
		},
		async remove(_userId, publicUrl) {
			if (!storageAvailable) throw new Error('storage unavailable');
			objects.delete(publicUrl);
		}
	};
	const configured = createServices(storage);
	const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
		.webp()
		.toBuffer();
	assert.equal((await upload(createAPI(configured), source, 'image.webp')).status, 200);
	assert.equal((await upload(createAPI(configured), source, 'replacement.webp')).status, 200);
	assert.deepEqual(
		[...objects],
		['/profile-images/users/scope/version-1.webp', '/profile-images/users/scope/version-2.webp']
	);
	assert.equal(
		(
			await createAPI(configured).request(`${origin}/api/profile/image`, {
				method: 'DELETE',
				headers: sessionHeaders
			})
		).status,
		204
	);
	assert.equal(objects.size, 2);

	storageAvailable = true;
	await configured.profileImageCleanup!.drain();
	assert.equal(objects.size, 0);
	await configured.profileImageCleanup!.drain();
	assert.equal(objects.size, 0, 'completed jobs are not processed again');
});

test('replacement, removal, and failed updates persist cleanup through a new drain', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-image-cleanup-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	let version = 0;
	let storageAvailable = false;
	let updateFails = false;
	const objects = new Set<string>();
	const storage: ProfileImageStorage = {
		async store() {
			const publicUrl = `/profile-images/users/scope/version-${++version}.webp`;
			objects.add(publicUrl);
			return publicUrl;
		},
		async remove(_userId, publicUrl) {
			if (!storageAvailable) throw new Error('storage unavailable');
			objects.delete(publicUrl);
		}
	};
	try {
		await migrate(connection.db, { migrationsFolder });
		await connection.db.insert(user).values({
			id: 'user-1',
			name: 'Image User',
			username: 'image_user',
			email: 'image@example.com'
		});
		const cleanup = createProfileImageCleanup({
			repository: createProfileImageCleanupRepository(connection.db),
			storage
		});
		const auth: AuthenticationService = {
			async handler() {
				return new Response(null, { status: 404 });
			},
			async setProfileImage(userId, image) {
				if (updateFails) throw new Error('identity update failed');
				await connection.db.update(user).set({ image }).where(eq(user.id, userId));
			},
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
			api: {
				async getSession() {
					const [identity] = await connection.db.select().from(user).where(eq(user.id, 'user-1'));
					return identity ? { user: identity } : null;
				},
				async verifyPassword() {}
			}
		};
		const configured = createServices(storage);
		configured.auth = auth;
		configured.profileImageCleanup = cleanup;
		configured.profileImages = createProfileImageService({ auth, storage, cleanup });
		const app = createAPI(configured);
		const source = await sharp({
			create: { width: 2, height: 2, channels: 3, background: 'red' }
		})
			.webp()
			.toBuffer();

		assert.equal((await upload(app, source, 'first.webp')).status, 200);
		assert.equal((await upload(app, source, 'replacement.webp')).status, 200);
		assert.equal(
			(
				await app.request(`${origin}/api/profile/image`, {
					method: 'DELETE',
					headers: sessionHeaders
				})
			).status,
			204
		);
		updateFails = true;
		assert.equal((await upload(app, source, 'orphan.webp')).status, 500);
		assert.equal(objects.size, 3);
		const pending = await connection.db.select().from(profileImageCleanupJob);
		assert.equal(pending.length, 3);
		assert.ok(pending.every((job) => job.attempts > 0));

		storageAvailable = true;
		await createProfileImageCleanup({
			repository: createProfileImageCleanupRepository(connection.db),
			storage
		}).drain();
		assert.equal(objects.size, 0);
		assert.deepEqual(await connection.db.select().from(profileImageCleanupJob), []);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('account deletion completes while object cleanup survives and succeeds after restart', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-account-image-cleanup-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	const publicUrl = '/profile-images/users/account/image.webp';
	let storageAvailable = false;
	const objects = new Set([publicUrl]);
	const storage: ProfileImageStorage = {
		async store() {
			return publicUrl;
		},
		async remove(_userId, imageUrl) {
			if (!storageAvailable) throw new Error('storage unavailable');
			objects.delete(imageUrl);
		}
	};
	try {
		await migrate(connection.db, { migrationsFolder });
		await connection.db.insert(user).values({
			id: 'account-user',
			name: 'Account User',
			username: 'account_user',
			email: 'account@example.com',
			image: publicUrl
		});
		const repository = createProfileImageCleanupRepository(connection.db);
		const cleanup = createProfileImageCleanup({ repository, storage });
		const configured = createServices(storage);
		configured.profileImageCleanup = cleanup;
		configured.workspaces = createWorkspaceRepository(connection.db);
		configured.auth.api.getSession = async () => ({
			user: {
				id: 'account-user',
				name: 'Account User',
				username: 'account_user',
				email: 'account@example.com',
				emailVerified: true,
				image: publicUrl
			}
		});

		const response = await createAPI(configured).request(`${origin}/api/account/delete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Session account-user' },
			body: JSON.stringify({ password: 'confirmed-password', confirmation: 'DELETE' })
		});
		assert.equal(response.status, 200, await response.clone().text());
		assert.equal(objects.has(publicUrl), true);
		const [job] = await connection.db.select().from(profileImageCleanupJob);
		assert.equal(job.attempts, 1);

		storageAvailable = true;
		await createProfileImageCleanup({
			repository: createProfileImageCleanupRepository(connection.db),
			storage
		}).drain();
		assert.equal(objects.has(publicUrl), false);
		assert.deepEqual(await connection.db.select().from(profileImageCleanupJob), []);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('profile image operations are rate-limited per authenticated user', async () => {
	const storage: ProfileImageStorage = {
		async store() {
			return '/profile-images/users/scope/version.webp';
		},
		async remove() {}
	};
	const app = createAPI(createServices(storage));
	const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
		.webp()
		.toBuffer();
	const statuses: number[] = [];
	for (let attempt = 0; attempt < 11; attempt += 1) {
		statuses.push((await upload(app, source, `image-${attempt}.webp`)).status);
	}
	assert.equal(statuses.filter((status) => status === 200).length, 10);
	assert.equal(statuses.at(-1), 429);
});
