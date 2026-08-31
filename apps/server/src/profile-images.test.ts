import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	createAPI,
	createProfileImageService,
	type APIServices,
	type AuthenticationService,
	type ProfileImageStorage
} from '@dukat/api';
import sharp from 'sharp';

import { createServerApp } from './create-server-app';
import { createLocalProfileImageStorage } from './profile-image-storage';

const origin = 'http://localhost:9999';
const portalOrigin = 'https://dukat-portal.example';
const sessionHeaders = { cookie: 'session=test', origin };

function createServices(
	storage: ProfileImageStorage,
	updateImage?: (image: string | null) => Promise<void>
): APIServices {
	let image: string | null = null;
	const auth: AuthenticationService = {
		async handler() {
			return new Response(null, { status: 404 });
		},
		async setProfileImage(_userId, nextImage) {
			if (updateImage) await updateImage(nextImage);
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
		profileImages: createProfileImageService({ auth, storage }),
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

test('an identity update failure removes the new profile-image object', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-images-'));
	try {
		const storage = createLocalProfileImageStorage(directory);
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
		const files = await readdir(directory, { recursive: true });
		assert.equal(
			files.some((path) => path.endsWith('.webp')),
			false
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('cleanup failure does not fail a completed profile-image change', async () => {
	const storage: ProfileImageStorage = {
		async store() {
			return '/profile-images/users/scope/version.webp';
		},
		async remove() {
			throw new Error('storage unavailable');
		}
	};
	const configured = createServices(storage);
	const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
		.webp()
		.toBuffer();
	assert.equal((await upload(createAPI(configured), source, 'image.webp')).status, 200);
	assert.equal(
		(
			await createAPI(configured).request(`${origin}/api/profile/image`, {
				method: 'DELETE',
				headers: sessionHeaders
			})
		).status,
		204
	);
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
