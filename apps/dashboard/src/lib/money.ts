export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export function parseAmount(
  value: string,
  currency: string,
  allowNegative = false,
): string {
  const digits = currencyDigits(currency)
  const decimals = digits === 0 ? '' : `(?:\\.\\d{1,${digits}})?`
  const pattern = new RegExp(`^${allowNegative ? '-?' : ''}\\d+${decimals}$`)
  if (!pattern.test(value.trim()))
    throw new Error(`Enter an amount with at most ${digits} decimal places.`)
  const [whole, fraction = ''] = value.trim().split('.')
  const negative = whole.startsWith('-')
  const unsignedWhole = negative ? whole.slice(1) : whole
  const minor =
    BigInt(unsignedWhole + fraction.padEnd(digits, '0')) * (negative ? -1n : 1n)
  if (minor < -(1n << 63n) || minor > (1n << 63n) - 1n)
    throw new Error('Amount is too large.')
  if (!allowNegative && minor <= 0n)
    throw new Error('Amount must be greater than zero.')
  return minor.toString()
}

export function minorToDecimal(minor: string, currency: string): string {
  const digits = currencyDigits(currency)
  const value = BigInt(minor)
  const sign = value < 0n ? '-' : ''
  const absolute = (value < 0n ? -value : value)
    .toString()
    .padStart(digits + 1, '0')
  if (digits === 0) return sign + absolute
  return `${sign}${absolute.slice(0, -digits)}.${absolute.slice(-digits)}`
}

export function formatMoney(minor: string, currency: string): string {
  const digits = currencyDigits(currency)
  const value = BigInt(minor)
  const divisor = 10n ** BigInt(digits)
  const whole = value / divisor
  const fraction = (value < 0n ? -(value % divisor) : value % divisor)
    .toString()
    .padStart(digits, '0')
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  // Number -0 is used only to obtain the locale's negative-zero affixes; no money is converted.
  const parts = formatter.formatToParts(value < 0n && whole === 0n ? -0 : whole)
  return parts
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('')
}
