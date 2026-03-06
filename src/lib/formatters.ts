import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return phone
}

function toSaoPaulo(date: Date): Date {
  const sp = date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  return new Date(sp)
}

export function formatDate(date: string | Date, pattern = 'dd/MM/yyyy'): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(parsed)) return '—'
  // Date-only strings (yyyy-MM-dd) are parsed as local midnight by parseISO.
  // Only apply timezone conversion for datetime strings (contain 'T' or 'Z').
  const isDateOnly = typeof date === 'string' && !date.includes('T') && !date.includes('Z')
  const adjusted = isDateOnly ? parsed : toSaoPaulo(parsed)
  return format(adjusted, pattern, { locale: ptBR })
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, "dd/MM/yyyy 'às' HH:mm")
}

export function formatMonthYear(date: string | Date): string {
  return formatDate(date, 'MMMM yyyy')
}

export function formatTime(time: string): string {
  return time.slice(0, 5)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}
