import createApp from './lib/create-app';
import configureOpenApi from './lib/configure-open-api';
import indexRoute from './routes/index.route';
import tasksRoute from './routes/tasks/tasks.index';

export const app = createApp();
const routes = [indexRoute, tasksRoute];

configureOpenApi(app);

routes.forEach((route) => {
	app.route('/', route);
});

export type AppType = typeof app;
