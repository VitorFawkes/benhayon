import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/formatters'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '@/constants'
import type { Appointment } from '@/types'

interface AppointmentCardProps {
  appointment: Appointment
  onClick?: () => void
  compact?: boolean
}

export function AppointmentCard({ appointment, onClick, compact = false }: AppointmentCardProps) {
  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status]
  const statusLabel = APPOINTMENT_STATUS_LABELS[appointment.status]
  const patientName = appointment.patient?.full_name ?? 'Paciente'

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition-opacity hover:opacity-80',
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md px-2 py-1.5 text-xs transition-all hover:shadow-md cursor-pointer border-l-3',
        appointment.status === 'scheduled' && 'bg-primary/10 border-l-primary',
        appointment.status === 'completed' && 'bg-success/10 border-l-success',
        appointment.status === 'cancelled' && 'bg-muted border-l-muted-foreground',
        appointment.status === 'no_show' && 'bg-destructive/10 border-l-destructive'
      )}
    >
      <p className="font-semibold text-foreground truncate leading-tight">
        {patientName}
      </p>
      <p className="text-muted-foreground leading-tight mt-0.5">
        {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
      </p>
      <span
        className={cn(
          'inline-block mt-1 rounded-full px-1.5 py-0 text-[10px] font-medium',
          statusColor
        )}
      >
        {statusLabel}
      </span>
    </button>
  )
}
