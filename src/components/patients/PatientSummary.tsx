import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  DollarSign,
  TrendingUp,
  Clock,
  CalendarCheck,
} from 'lucide-react'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Skeleton } from '@/components/ui/skeleton'

interface PatientSummaryProps {
  patientId: string
  sessionValue: number
}

interface SummaryData {
  completedThisMonth: number
  scheduledThisMonth: number
  noShowThisMonth: number
  pendingAmount: number
  receivedThisMonth: number
  lastSessionDate: string | null
}

export default function PatientSummary({ patientId, sessionValue }: PatientSummaryProps) {
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['patient-summary', patientId, monthStart],
    queryFn: async (): Promise<SummaryData> => {
      const [appointmentsRes, invoicesRes, paymentsRes, lastSessionRes] =
        await Promise.all([
          // Appointments this month
          supabase
            .from('appointments')
            .select('status')
            .eq('patient_id', patientId)
            .gte('date', monthStart)
            .lte('date', monthEnd),

          // Pending invoices
          supabase
            .from('invoices')
            .select('total_amount, amount_paid')
            .eq('patient_id', patientId)
            .in('status', ['pending', 'partial', 'overdue']),

          // Payments this month
          supabase
            .from('payments')
            .select('amount')
            .eq('patient_id', patientId)
            .gte('payment_date', monthStart)
            .lte('payment_date', monthEnd),

          // Last completed appointment
          supabase
            .from('appointments')
            .select('date')
            .eq('patient_id', patientId)
            .eq('status', 'completed')
            .order('date', { ascending: false })
            .limit(1),
        ])

      if (appointmentsRes.error) throw appointmentsRes.error
      if (invoicesRes.error) throw invoicesRes.error
      if (paymentsRes.error) throw paymentsRes.error
      if (lastSessionRes.error) throw lastSessionRes.error

      const appointments = appointmentsRes.data ?? []
      const invoices = invoicesRes.data ?? []
      const payments = paymentsRes.data ?? []
      const lastSession = lastSessionRes.data?.[0] ?? null

      return {
        completedThisMonth: appointments.filter((a) => a.status === 'completed').length,
        scheduledThisMonth: appointments.filter((a) => a.status === 'scheduled').length,
        noShowThisMonth: appointments.filter((a) => a.status === 'no_show').length,
        pendingAmount: invoices.reduce(
          (sum, inv) => sum + (inv.total_amount - inv.amount_paid),
          0
        ),
        receivedThisMonth: payments.reduce((sum, p) => sum + p.amount, 0),
        lastSessionDate: lastSession?.date ?? null,
      }
    },
    enabled: !!patientId,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const stats = data ?? {
    completedThisMonth: 0,
    scheduledThisMonth: 0,
    noShowThisMonth: 0,
    pendingAmount: 0,
    receivedThisMonth: 0,
    lastSessionDate: null,
  }

  const monthTotal = stats.completedThisMonth * sessionValue

  const cards = [
    {
      icon: CalendarDays,
      label: 'Sessoes do mes',
      value: `${stats.completedThisMonth} realizadas / ${stats.scheduledThisMonth} agendadas`,
      color: 'text-primary',
      bgColor: 'bg-primary-light',
    },
    {
      icon: DollarSign,
      label: 'Valor do mes',
      value: formatCurrency(monthTotal),
      color: 'text-secondary',
      bgColor: 'bg-secondary-light',
    },
    {
      icon: TrendingUp,
      label: 'Recebido',
      value: formatCurrency(stats.receivedThisMonth),
      color: 'text-success',
      bgColor: 'bg-success-light',
    },
    {
      icon: Clock,
      label: 'Pendente',
      value: formatCurrency(stats.pendingAmount),
      color: 'text-warning',
      bgColor: 'bg-warning-light',
    },
    {
      icon: CalendarCheck,
      label: 'Ultima sessao',
      value: stats.lastSessionDate ? formatDate(stats.lastSessionDate) : '—',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
    >
      {cards.map((card) => {
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
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{card.value}</p>
          </div>
        )
      })}
    </motion.div>
  )
}
