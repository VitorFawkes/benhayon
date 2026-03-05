import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CreditCard, DollarSign, Clock, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/formatters'
import { PAYMENT_METHOD_LABELS } from '@/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import PatientBillingStatus from '@/components/patients/PatientBillingStatus'
import type { Payment, Invoice } from '@/types'

interface PatientPaymentsProps {
  patientId: string
}

type PaymentWithInvoice = Payment & {
  invoice: Pick<Invoice, 'reference_month' | 'status'> | null
}

export default function PatientPayments({ patientId }: PatientPaymentsProps) {
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['patient-payments', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, invoice:invoices(reference_month, status)')
        .eq('patient_id', patientId)
        .order('payment_date', { ascending: false })

      if (error) throw error
      return data as PaymentWithInvoice[]
    },
    enabled: !!patientId,
  })

  const { data: pendingAmount, isLoading: loadingPending } = useQuery({
    queryKey: ['patient-pending-amount', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid')
        .eq('patient_id', patientId)
        .in('status', ['pending', 'partial', 'overdue'])

      if (error) throw error

      return (data ?? []).reduce(
        (sum, inv) => sum + (inv.total_amount - inv.amount_paid),
        0
      )
    },
    enabled: !!patientId,
  })

  const isLoading = loadingPayments || loadingPending

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const items = payments ?? []
  const totalPaid = items.reduce((sum, p) => sum + p.amount, 0)

  const summaryCards = [
    {
      label: 'Total pago',
      value: formatCurrency(totalPaid),
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success-light',
    },
    {
      label: 'Pendente',
      value: formatCurrency(pendingAmount ?? 0),
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning-light',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Billing Status */}
      <PatientBillingStatus patientId={patientId} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="bg-surface border border-border rounded-xl p-4 shadow-soft"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    card.bgColor
                  )}
                >
                  <Icon size={16} className={card.color} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold text-foreground">{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nenhum pagamento registrado
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Os pagamentos deste paciente aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Cobrança ref.</TableHead>
                  <TableHead>Comprovante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {formatDate(payment.payment_date)}
                    </TableCell>
                    <TableCell className="font-medium text-success">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <span>{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</span>
                      {payment.source === 'receipt_confirmed' && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-success-light text-success font-medium">
                          via comprovante
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {payment.invoice?.reference_month
                        ? formatMonthYear(payment.invoice.reference_month)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {payment.receipt_url ? (
                        <a
                          href={payment.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 group"
                        >
                          <img
                            src={payment.receipt_url}
                            alt="Comprovante"
                            className="w-10 h-10 rounded-md object-cover border border-border group-hover:opacity-80 transition-opacity"
                          />
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </motion.div>
  )
}
