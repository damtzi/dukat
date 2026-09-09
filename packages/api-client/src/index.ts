import { hc } from 'hono/client';
import type { APIType } from '@dukat/api';
import type { output, ZodType } from 'zod';

type Fetch = typeof globalThis.fetch;
export type ResponseSchema = ZodType;
export type InferResponse<T extends ResponseSchema> = output<T>;

export const createApiClient = (baseUrl: string) => {
	return hc<APIType>(baseUrl);
};

export type ApiClient = ReturnType<typeof createApiClient>;

function isResponseSchema<T extends ZodType>(value: T | RequestInit | undefined): value is T {
	return Boolean(value && 'parse' in value && typeof value.parse === 'function');
}

export async function requestJson<T extends ZodType>(
	fetcher: Fetch,
	url: string,
	schema: T,
	options?: RequestInit
): Promise<output<T>>;
export async function requestJson(
	fetcher: Fetch,
	url: string,
	options?: RequestInit
): Promise<unknown | null>;
export async function requestJson<T extends ZodType>(
	fetcher: Fetch,
	url: string,
	schemaOrOptions?: T | RequestInit,
	requestOptions?: RequestInit
) {
	let schema: T | undefined;
	let options: RequestInit | undefined;
	if (isResponseSchema(schemaOrOptions)) {
		schema = schemaOrOptions;
		options = requestOptions;
	} else {
		options = schemaOrOptions;
	}
	const headers = new Headers(options?.headers);
	if (typeof options?.body === 'string' && !headers.has('content-type'))
		headers.set('content-type', 'application/json');

	const response = await fetcher(url, { ...options, headers });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => ({}));
		const message =
			typeof body === 'object' && body !== null && 'message' in body
				? String(body.message)
				: response.status === 409
					? 'This item changed elsewhere. Refresh and try again.'
					: `Request failed (${response.status}).`;
		throw new Error(message);
	}

	const body: unknown = response.status === 204 ? null : await response.json();
	return schema ? schema.parse(body) : body;
}
