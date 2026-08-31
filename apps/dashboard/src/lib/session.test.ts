import { describe, expect, it } from 'vitest'
import { profileInitials } from './session'

describe('profileInitials', () => {
  it('uses the first and last words', () => {
    expect(profileInitials('Ada Byron Lovelace')).toBe('AL')
  })

  it('uses one initial for a one-word name', () => {
    expect(profileInitials('prince')).toBe('P')
  })

  it('returns no initials for an empty name', () => {
    expect(profileInitials('  ')).toBe('')
  })
})
