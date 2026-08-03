export type SessionResult =
  | { status: 'authenticated'; session: unknown }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

export async function getBrowserSession(): Promise<SessionResult> {
  try {
    const response = await fetch('/api/auth/get-session')
    if (!response.ok) {
      return {
        status: 'error',
        message: `Could not check your session (${response.status}).`,
      }
    }
    const session = await response.json()
    return session
      ? { status: 'authenticated', session }
      : { status: 'unauthenticated' }
  } catch {
    return { status: 'error', message: 'Could not connect to Dukat.' }
  }
}
