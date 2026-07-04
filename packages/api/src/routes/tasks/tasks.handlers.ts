import { AppRouterHandler } from '../../lib/types';
import type { ListRoute } from './tasks.routes';

export const list: AppRouterHandler<ListRoute> = (c) => {
	return c.json([
		{
			name: 'Task 1',
			done: false
		}
	]);
};
