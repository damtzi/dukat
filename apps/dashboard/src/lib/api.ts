import {
  requestJson,
  type InferResponse,
  type ResponseSchema,
} from '@dukat/api-client'

type Fetch = typeof globalThis.fetch

export const workspacesDataDependency = 'dukat:workspaces'
export const workspaceDataDependency = 'dukat:workspace'
export const overviewDataDependency = 'dukat:overview'

export function api<Response = unknown>(
  path: string,
  options?: RequestInit,
): Promise<Response>
export function api(path: string, options?: RequestInit) {
  return requestJson(globalThis.fetch, `/api${path}`, options)
}

export function apiJson<T extends ResponseSchema>(
  path: string,
  schema: T,
  options?: RequestInit,
): Promise<InferResponse<T>>
export function apiJson(
  path: string,
  schema: ResponseSchema,
  options?: RequestInit,
) {
  return requestJson(globalThis.fetch, `/api${path}`, schema, options)
}

export function loadApi<Response = unknown>(
  fetcher: Fetch,
  path: string,
  options?: RequestInit,
): Promise<Response>
export function loadApi(fetcher: Fetch, path: string, options?: RequestInit) {
  return requestJson(fetcher, `/api${path}`, options)
}

export function loadApiJson<T extends ResponseSchema>(
  fetcher: Fetch,
  path: string,
  schema: T,
  options?: RequestInit,
): Promise<InferResponse<T>>
export function loadApiJson(
  fetcher: Fetch,
  path: string,
  schema: ResponseSchema,
  options?: RequestInit,
) {
  return requestJson(fetcher, `/api${path}`, schema, options)
}
