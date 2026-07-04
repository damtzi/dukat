import { AppOpenApi } from './types';

import packageJson from '../../package.json';
import { Scalar } from '@scalar/hono-api-reference';

export default function configureOpenApi(app: AppOpenApi) {
	app.doc('/doc', {
		openapi: '3.1.0',
		info: {
			title: 'Template API',
			version: packageJson.version
		}
	});

	app.get(
		'/scalar',
		Scalar({
			url: '/doc',
			pageTitle: 'Template API',
			theme: 'bluePlanet',
			layout: 'classic',
			defaultHttpClient: {
				targetKey: 'javascript',
				clientKey: 'fetch'
			}
		})
	);
}
