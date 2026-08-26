type Fetch = typeof globalThis.fetch

export const workspaceDataDependency = 'dukat:workspace'

async function request(fetcher: Fetch, path: string, options?: RequestInit) {
  const response = await fetcher(`/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      body.message ||
        (response.status === 409
          ? 'This item changed elsewhere. Refresh and try again.'
          : `Request failed (${response.status}).`),
    )
  }
  return response.status === 204 ? null : response.json()
}

export function api(path: string, options?: RequestInit) {
  return request(globalThis.fetch, path, options)
}

export function loadApi(fetcher: Fetch, path: string, options?: RequestInit) {
  return request(fetcher, path, options)
}
