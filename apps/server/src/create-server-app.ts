import { serveStatic } from '@hono/node-server/serve-static';
import { Hono as HonoApp } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

interface FetchApplication {
	fetch(request: Request): Response | Promise<Response>;
}

export interface CreateServerAppOptions {
	api: FetchApplication;
	dashboardDirectory: string;
	profileImagesDirectory?: string;
	profileImageOrigin?: string;
	isProduction?: boolean;
}

export function resolveDashboardDirectory(
	directory: string,
	options: { cwd?: string; production?: boolean } = {}
) {
	if (options.production && !isAbsolute(directory)) {
		throw new Error('DASHBOARD_DIRECTORY must be absolute in production');
	}

	return resolve(options.cwd ?? process.cwd(), directory);
}

export function verifyDashboardProfileImageOrigin(
	dashboardDirectory: string,
	profileImageOrigin: string
) {
	const index = readFileSync(join(dashboardDirectory, 'index.html'), 'utf8');
	const policyTag = index.match(
		/<meta\s+[^>]*http-equiv=["']content-security-policy["'][^>]*>/i
	)?.[0];
	const policy = policyTag?.match(/\scontent=(["'])(.*?)\1/i)?.[2];
	const imageSources = policy
		?.split(';')
		.find((directive) => directive.trim().startsWith('img-src'))
		?.trim()
		.split(/\s+/)
		.slice(1);

	if (!imageSources?.includes(profileImageOrigin)) {
		throw new Error(
			`Dashboard CSP does not permit ${profileImageOrigin}; rebuild it with the same PROFILE_IMAGE_PUBLIC_BASE_URL.`
		);
	}
}

export function createServerApp({
	api,
	dashboardDirectory,
	profileImagesDirectory,
	profileImageOrigin,
	isProduction = false
}: CreateServerAppOptions) {
	if (isProduction && profileImageOrigin) {
		verifyDashboardProfileImageOrigin(dashboardDirectory, profileImageOrigin);
	}
	const app = new HonoApp();

	app.use(
		'*',
		secureHeaders({
			contentSecurityPolicy: {
				frameAncestors: ["'none'"],
				imgSrc: ["'self'", 'data:', 'blob:', ...(profileImageOrigin ? [profileImageOrigin] : [])]
			},
			permissionsPolicy: {
				camera: [],
				geolocation: [],
				microphone: [],
				payment: []
			},
			strictTransportSecurity: isProduction
		})
	);
	app.use('/api/*', async (c) => {
		const response = await api.fetch(c.req.raw);
		response.headers.set('cache-control', 'no-store');
		return response;
	});
	if (profileImagesDirectory) {
		app.use('/profile-images/*', async (c, next) => {
			await next();
			if (c.res.status === 200) {
				c.header('cache-control', 'public, max-age=31536000, immutable');
			}
		});
		app.use(
			'/profile-images/*',
			serveStatic({
				root: profileImagesDirectory,
				rewriteRequestPath: (path) => path.slice('/profile-images'.length)
			})
		);
		app.get('/profile-images/*', (c) => c.notFound());
	}
	app.use('*', serveStatic({ root: dashboardDirectory }));
	app.get('*', serveStatic({ path: join(dashboardDirectory, 'index.html') }));

	return app;
}
