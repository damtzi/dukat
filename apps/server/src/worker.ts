import { createAPI } from '@dukat/api';
import { createAuth } from '@dukat/auth/create-auth';
import { createResendEmailSender } from '@dukat/auth/email';
import { createDatabase } from '@dukat/db/connection';
import { createWorkerEnv } from '@dukat/env/worker';

interface WorkerEnv {
	ASSETS: { fetch(request: Request): Promise<Response> };
	NODE_ENV: 'production';
	LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN: string;
	RESEND_API_KEY: string;
	AUTH_EMAIL_FROM: string;
}

function variables(env: WorkerEnv) {
	return {
		NODE_ENV: env.NODE_ENV,
		LOG_LEVEL: env.LOG_LEVEL,
		BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: env.BETTER_AUTH_URL,
		TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
		TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
		RESEND_API_KEY: env.RESEND_API_KEY,
		AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM
	};
}

function secure(response: Response) {
	const secured = new Response(response.body, response);
	secured.headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=()');
	secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	secured.headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains');
	secured.headers.set('x-content-type-options', 'nosniff');
	secured.headers.set('x-frame-options', 'DENY');
	return secured;
}

function createRuntime(bindings: WorkerEnv) {
	const env = createWorkerEnv(variables(bindings));
	const { db } = createDatabase({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN
	});
	const auth = createAuth({
		database: db,
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		emailSender: createResendEmailSender(env.RESEND_API_KEY, env.AUTH_EMAIL_FROM),
		isProduction: true
	});
	return {
		api: createAPI({ auth, readiness: () => db.run('select 1') }, { logLevel: env.LOG_LEVEL })
	};
}

let runtime: ReturnType<typeof createRuntime> | undefined;

export default {
	async fetch(request: Request, env: WorkerEnv) {
		const configured = createWorkerEnv(variables(env));
		if (new URL(request.url).origin !== configured.BETTER_AUTH_URL) {
			return secure(new Response('Worker origin does not match BETTER_AUTH_URL.', { status: 500 }));
		}
		runtime ??= createRuntime(env);
		const pathname = new URL(request.url).pathname;
		let response: Response;
		if (pathname.startsWith('/api/')) {
			response = await runtime.api.fetch(request);
			response.headers.set('cache-control', 'no-store');
		} else {
			const assetRequest =
				pathname === '/admin' || pathname === '/admin/'
					? new Request(new URL('/admin/index.html', request.url), request)
					: request;
			response = await env.ASSETS.fetch(assetRequest);
		}
		return secure(response);
	}
};
