type Fetch = typeof globalThis.fetch

export const workspacesDataDependency = 'dukat:workspaces'
export const workspaceDataDependency = 'dukat:workspace'

async function request(fetcher: Fetch, path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers)
  if (typeof options?.body === 'string' && !headers.has('content-type'))
    headers.set('content-type', 'application/json')

  const response = await fetcher(`/api${path}`, {
    ...options,
    headers,
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
