export interface SessionUser {
  id: string
  name: string
  username: string
  email: string
  emailVerified: boolean
  image?: string | null
}

export interface AuthenticatedSession {
  session: { id: string }
  user: SessionUser
}

export type SessionResult =
  | { status: 'authenticated'; session: AuthenticatedSession }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

export async function getBrowserSession(): Promise<SessionResult> {
  try {
    const response = await fetch('/api/auth/get-session')
    if (!response.ok) {
      return {
        status: 'error',
        message: `Could not check your session (${response.status}).`,
      }
    }
    const session = (await response.json()) as AuthenticatedSession | null
    return session
      ? { status: 'authenticated', session }
      : { status: 'unauthenticated' }
  } catch {
    return { status: 'error', message: 'Could not connect to Dukat.' }
  }
}
