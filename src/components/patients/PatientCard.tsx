import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Phone,
  DollarSign,
  Building2,
  Calendar,
  Clock,
  MessageSquare,
  FileImage,
  Bot,
  BotOff,
  ChevronRight,
  Receipt,
  CheckCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCurrency, formatPhone, formatDate } from '@/lib/formatters'
import { PATIENT_STATUS_COLORS } from '@/constants'
import { supabase } from '@/lib/supabase'
import type { Patient } from '@/types'
import { startOfMonth, endOfMonth, format } from 'date-fns'

interface PatientCardProps {
  patient: Patient
  index: number
}

export default function PatientCard({ patient, index }: PatientCardProps) {
  const navigate = useNavigate()

  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
  const today = format(now, 'yyyy-MM-dd')

  const { data: stats } = useQuery({
    queryKey: ['patient-card-stats', patient.id, monthStart],
    queryFn: async () => {
      const [nextApt, monthSessions, noShows, pending, unread, receipts] = await Promise.all([
        supabase.from('appointments').select('date, start_time').eq('patient_id', patient.id).eq('status', 'scheduled').gte('date', today).order('date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id).eq('status', 'completed').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id).eq('status', 'no_show').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('invoices').select('total_amount, amount_paid').eq('patient_id', patient.id).in('status', ['pending', 'partial', 'overdue']),
        supabase.from('message_logs').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id).eq('direction', 'inbound').eq('ai_processed', false),
        supabase.from('receipt_analyses').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id).eq('status', 'pending_review'),
      ])
      const pendingAmount = pending.data?.reduce((s, i) => s + (Number(i.total_amount) - Number(i.amount_paid)), 0) || 0
      return {
        nextAppointment: nextApt.data,
        monthSessions: monthSessions.count || 0,
        noShows: noShows.count || 0,
        pendingAmount,
        unreadMessages: unread.count || 0,
        pendingReceipts: receipts.count || 0,
      }
    },
    staleTime: 60_000,
  })

  const hasAlerts = (stats?.unreadMessages || 0) > 0 || (stats?.pendingReceipts || 0) > 0
  const hasPending = (stats?.pendingAmount || 0) > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-elevated group overflow-hidden',
          hasAlerts && 'ring-1 ring-warning/30',
        )}
        onClick={() => navigate(`/patients/${patient.id}`)}
      >
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                patient.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {patient.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">{patient.full_name}</h3>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', PATIENT_STATUS_COLORS[patient.status])}>
                    {patient.status === 'active' ? 'Ativo' : patient.status === 'paused' ? 'Pausado' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{formatPhone(patient.phone)}</span>
                  <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(patient.session_value)}</span>
                  {patient.payment_type === 'clinic' && patient.clinic?.name && (
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{patient.clinic.name}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {patient.ai_enabled !== false ? (
                <Bot className="h-4 w-4 text-primary/50" />
              ) : (
                <BotOff className="h-4 w-4 text-muted-foreground/40" />
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </div>
          </div>

          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-4 gap-px bg-border/50 border-t border-border">
              <div className="bg-surface p-2.5 text-center">
                <Calendar className="h-3.5 w-3.5 mx-auto text-primary/60 mb-1" />
                <p className="text-[10px] text-muted-foreground">Próxima</p>
                <p className="text-xs font-medium text-foreground">
                  {stats.nextAppointment ? formatDate(stats.nextAppointment.date, 'dd/MM') : '—'}
                </p>
              </div>
              <div className="bg-surface p-2.5 text-center">
                <Clock className="h-3.5 w-3.5 mx-auto text-secondary/60 mb-1" />
                <p className="text-[10px] text-muted-foreground">Sessões/mês</p>
                <p className="text-xs font-medium text-foreground">
                  {stats.monthSessions}
                  {stats.noShows > 0 && <span className="text-destructive ml-1">({stats.noShows} falta{stats.noShows > 1 ? 's' : ''})</span>}
                </p>
              </div>
              <div className="bg-surface p-2.5 text-center">
                <Receipt className={cn('h-3.5 w-3.5 mx-auto mb-1', hasPending ? 'text-warning' : 'text-success/60')} />
                <p className="text-[10px] text-muted-foreground">Pendente</p>
                <p className={cn('text-xs font-medium', hasPending ? 'text-warning' : 'text-success')}>
                  {hasPending ? formatCurrency(stats.pendingAmount) : 'Em dia'}
                </p>
              </div>
              <div className="bg-surface p-2.5 text-center">
                {stats.pendingReceipts > 0 ? (
                  <>
                    <FileImage className="h-3.5 w-3.5 mx-auto text-warning mb-1" />
                    <p className="text-[10px] text-muted-foreground">Comprovantes</p>
                    <p className="text-xs font-medium text-warning">{stats.pendingReceipts} revisar</p>
                  </>
                ) : stats.unreadMessages > 0 ? (
                  <>
                    <MessageSquare className="h-3.5 w-3.5 mx-auto text-info mb-1" />
                    <p className="text-[10px] text-muted-foreground">Mensagens</p>
                    <p className="text-xs font-medium text-info">{stats.unreadMessages} nova{stats.unreadMessages > 1 ? 's' : ''}</p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 mx-auto text-success/60 mb-1" />
                    <p className="text-[10px] text-muted-foreground">Status</p>
                    <p className="text-xs font-medium text-success">Tudo ok</p>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
