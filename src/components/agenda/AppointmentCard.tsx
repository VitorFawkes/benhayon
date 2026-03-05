import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/formatters'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '@/constants'
import type { Appointment } from '@/types'

interface AppointmentCardProps {
  appointment: Appointment
  onClick?: () => void
  onNoteClick?: (appointment: Appointment) => void
  hasNote?: boolean
  compact?: boolean
}

export function AppointmentCard({ appointment, onClick, onNoteClick, hasNote, compact = false }: AppointmentCardProps) {
  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status]
  const statusLabel = APPOINTMENT_STATUS_LABELS[appointment.status]
  const patientName = appointment.patient?.full_name ?? 'Paciente'

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition-all hover:opacity-80 active:opacity-60 cursor-pointer',
          statusColor
        )}
        title={`${patientName} - ${formatTime(appointment.start_time)} - ${formatTime(appointment.end_time)}`}
      >
        <span className="font-medium">{formatTime(appointment.start_time)}</span>{' '}
        <span className="truncate">{patientName}</span>
      </button>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      className={cn(
        'w-full h-full text-left rounded-md px-2 py-1.5 text-xs transition-all hover:shadow-md active:scale-[0.98] active:shadow-sm cursor-pointer border-l-3',
        appointment.status === 'scheduled' && 'bg-primary/10 border-l-primary',
        appointment.status === 'completed' && 'bg-success/10 border-l-success',
        appointment.status === 'cancelled' && 'bg-muted border-l-muted-foreground',
        appointment.status === 'no_show' && 'bg-destructive/10 border-l-destructive'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate leading-tight">
            {patientName}
          </p>
          <p className="text-muted-foreground leading-tight mt-0.5">
            {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
          </p>
        </div>
        {appointment.status === 'completed' && onNoteClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNoteClick(appointment)
            }}
            className={cn(
              'shrink-0 p-1 rounded hover:bg-black/10 transition-colors',
              hasNote ? 'text-primary' : 'text-muted-foreground'
            )}
            title="Prontuário"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <span
        className={cn(
          'inline-block mt-1 rounded-full px-1.5 py-0 text-[10px] font-medium',
          statusColor
        )}
      >
        {statusLabel}
      </span>
    </div>
  )
}
