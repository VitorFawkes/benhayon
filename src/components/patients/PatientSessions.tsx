import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, Clock, XCircle, Ban, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { cn, appointmentToTarget } from '@/lib/utils'
import { formatDate, formatTime } from '@/lib/formatters'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '@/constants'
import { useSessionNotesByPatient } from '@/hooks/useSessionNotes'
import SessionNoteDialog from '@/components/patients/SessionNoteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import type { Appointment, AppointmentStatus, SessionNoteTarget } from '@/types'

interface PatientSessionsProps {
  patientId: string
  dateRange?: { from: Date; to: Date }
}

export default function PatientSessions({ patientId, dateRange }: PatientSessionsProps) {
  const [noteTarget, setNoteTarget] = useState<SessionNoteTarget | null>(null)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const { data: noteIds } = useSessionNotesByPatient(patientId)

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['patient-sessions', patientId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select('*, patient:patients(full_name)')
        .eq('patient_id', patientId)
        .order('date', { ascending: false })

      if (dateRange) {
        query = query
          .gte('date', format(dateRange.from, 'yyyy-MM-dd'))
          .lte('date', format(dateRange.to, 'yyyy-MM-dd'))
      } else {
        query = query.limit(50)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Appointment[]
    },
    enabled: !!patientId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const items = appointments ?? []

  const completed = items.filter((a) => a.status === 'completed').length
  const scheduled = items.filter((a) => a.status === 'scheduled').length
  const noShow = items.filter((a) => a.status === 'no_show').length
  const cancelled = items.filter((a) => a.status === 'cancelled').length

  const summaryCards = [
    {
      label: 'Realizadas',
      value: completed,
      icon: CheckCircle2,
      color: 'text-success',
      bgColor: 'bg-success-light',
    },
    {
      label: 'Agendadas',
      value: scheduled,
      icon: Clock,
      color: 'text-primary',
      bgColor: 'bg-primary-light',
    },
    {
      label: 'Faltas',
      value: noShow,
      icon: XCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive-light',
    },
    {
      label: 'Canceladas',
      value: cancelled,
      icon: Ban,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nenhuma sessão registrada
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              As sessões deste paciente aparecerão aqui.
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
                  <TableHead>Horário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="w-[100px]">Prontuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell className="font-medium">
                      {formatDate(appointment.date)}
                    </TableCell>
                    <TableCell>
                      {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'border-0',
                          APPOINTMENT_STATUS_COLORS[appointment.status as AppointmentStatus]
                        )}
                      >
                        {APPOINTMENT_STATUS_LABELS[appointment.status as AppointmentStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm text-muted-foreground truncate block">
                        {appointment.notes || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNoteTarget(appointmentToTarget(appointment))
                          setNoteDialogOpen(true)
                        }}
                        className="gap-1.5"
                      >
                        <FileText className={cn(
                          'h-4 w-4',
                          noteIds?.has(appointment.id) ? 'text-primary' : 'text-muted-foreground'
                        )} />
                        {noteIds?.has(appointment.id) ? 'Ver' : 'Criar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <SessionNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        target={noteTarget}
      />
    </motion.div>
  )
}
