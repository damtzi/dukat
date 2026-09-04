import type { Account } from '@dukat/core/ledger'
import { formatMoney } from './money'

export function accountTypeLabel(type: Account['type']) {
  return type === 'credit_card'
    ? 'Credit card'
    : type.charAt(0).toUpperCase() + type.slice(1)
}

export function formatAccountBalance(
  account: Pick<Account, 'type' | 'currency' | 'balanceMinor'>,
) {
  if (account.type !== 'credit_card')
    return formatMoney(account.balanceMinor, account.currency)

  const balance = BigInt(account.balanceMinor)
  return balance > 0n
    ? `Card credit ${formatMoney(account.balanceMinor, account.currency)}`
    : `Owed ${formatMoney((-balance).toString(), account.currency)}`
}
