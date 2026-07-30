import type { AppOpenAPI } from './types';

import packageJson from '../../package.json';
import { Scalar } from '@scalar/hono-api-reference';

export default function configureOpenAPI(app: AppOpenAPI) {
	app.openAPIRegistry.registerComponent('securitySchemes', 'sessionCookie', {
		type: 'apiKey',
		in: 'cookie',
		name: 'better-auth.session_token',
		description: 'Better Auth session cookie; production cookie names use the secure prefix.'
	});

	app.doc('/api/doc', {
		openapi: '3.1.0',
		info: {
			title: 'Dukat API',
			version: packageJson.version
		}
	});

	app.get(
		'/api/scalar',
		Scalar({
			url: '/api/doc',
			pageTitle: 'Dukat API',
			theme: 'bluePlanet',
			layout: 'classic',
			defaultHttpClient: {
				targetKey: 'javascript',
				clientKey: 'fetch'
			}
		})
	);
}
