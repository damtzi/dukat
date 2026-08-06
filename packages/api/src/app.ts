import configureOpenAPI from './lib/configure-open-api';
import createApp from './lib/create-app';
import { authRouter } from './routes/auth/auth.index';
import { healthRouter } from './routes/health/health.index';
import { ledgerRouter } from './routes/ledger/ledger.index';
import { workspacesRouter } from './routes/workspaces/workspaces.index';
import { insightsRouter } from './routes/insights/insights.index';
import { exchangeRatesRouter } from './routes/exchange-rates/exchange-rates.index';
import type { APIServices } from './services';
import { planningRouter } from './routes/planning/planning.index';

export function createAPI(services: APIServices) {
	const app = createApp(services);
	configureOpenAPI(app);

	return app
		.route('/api', authRouter)
		.route('/api', healthRouter)
		.route('/api', workspacesRouter)
		.route('/api', insightsRouter)
		.route('/api', exchangeRatesRouter)
		.route('/api', planningRouter)
		.route('/api', ledgerRouter);
}

export type APIType = ReturnType<typeof createAPI>;
