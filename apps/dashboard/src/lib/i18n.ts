export const defaultLocale = 'pl-PL'

export const messages = {
  en: {
    dashboard: {
      title: 'Your finances, clearly',
      description: 'Sign in to view your personal and household workspaces.',
    },
  },
} as const

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat(defaultLocale).format(date)
}
