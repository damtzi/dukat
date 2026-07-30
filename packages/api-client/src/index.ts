import { hc } from 'hono/client';
import type { APIType } from '@dukat/api';

export const createApiClient = (baseUrl: string) => {
	return hc<APIType>(baseUrl);
};

export type ApiClient = ReturnType<typeof createApiClient>;
