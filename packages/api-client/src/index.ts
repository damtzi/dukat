import { hc } from 'hono/client';
import type { AppType } from '@repo/api';

export const createApiClient = (baseUrl: string) => {
	return hc<AppType>(baseUrl);
};

export type ApiClient = ReturnType<typeof createApiClient>;
