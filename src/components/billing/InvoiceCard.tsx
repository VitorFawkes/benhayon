import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/constants'
import type { Invoice, Payment } from '@/types'
import { Badge } from '@/components/ui/badge'

interface InvoiceCardProps {
  invoice: Invoice
  payments?: Payment[]
  expanded?: boolean
  onToggleExpand?: () => void
}

export function InvoiceCard({
  invoice,
  payments = [],
  expanded = false,
  onToggleExpand,
}: InvoiceCardProps) {
  const remaining = invoice.total_amount - invoice.amount_paid
  const progressPercent =
    invoice.total_amount > 0
      ? Math.min((invoice.amount_paid / invoice.total_amount) * 100, 100)
      : 0

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      {/* Linha principal */}
      <button
        type="button"
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-surface-hover active:bg-muted/50 transition-all cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">
            {invoice.patient?.full_name ?? 'Paciente'}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {format(new Date(invoice.reference_month + 'T12:00:00'), 'MMMM yyyy', {
              locale: ptBR,
            })}
          </p>
        </div>

        <div className="hidden sm:block text-center min-w-[60px]">
          <p className="text-sm font-medium text-foreground">
            {invoice.total_sessions}
          </p>
          <p className="text-xs text-muted-foreground">
            {invoice.total_sessions === 1 ? 'sessão' : 'sessões'}
          </p>
        </div>

        <div className="hidden sm:block text-right min-w-[90px]">
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(invoice.total_amount)}
          </p>
          <p className="text-xs text-muted-foreground">total</p>
        </div>

        <div className="text-right min-w-[90px]">
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(invoice.amount_paid)}
          </p>
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `falta ${formatCurrency(remaining)}`
              : 'quitado'}
          </p>
        </div>

        <Badge
          className={cn(
            'text-xs whitespace-nowrap',
            INVOICE_STATUS_COLORS[invoice.status]
          )}
        >
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>

        <motion.span
          className="text-muted-foreground"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {/* Barra de progresso */}
      <div className="px-4 pb-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              invoice.status === 'paid'
                ? 'bg-success'
                : invoice.status === 'overdue'
                  ? 'bg-destructive'
                  : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Detalhes expandidos: pagamentos */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pagamentos
              </p>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum pagamento registrado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-surface"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {formatDate(payment.payment_date)}
                        </span>
                        <span className="text-foreground font-medium">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Vencimento</span>
                <span className="text-foreground">
                  {formatDate(invoice.due_date)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
