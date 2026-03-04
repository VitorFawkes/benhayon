import { useMemo } from 'react'
import {
  format,
  isToday,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from 'date-fns'
import { cn } from '@/lib/utils'
import type { Appointment, AppointmentStatus } from '@/types'

// ─── Status dot colors ───

const STATUS_DOT_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-primary',
  completed: 'bg-success',
  cancelled: 'bg-muted-foreground',
  no_show: 'bg-destructive',
}

// ─── Props ───

interface MonthViewProps {
  selectedDate: Date
  appointments: Appointment[]
  onDayClick: (date: Date) => void
}

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function MonthView({ selectedDate, appointments, onDayClick }: MonthViewProps) {
  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(selectedDate)
    const monthEnd = endOfMonth(selectedDate)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [selectedDate])

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appointment of appointments) {
      const key = appointment.date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(appointment)
    }
    return map
  }, [appointments])

  // Split days into rows of 7
  const weeks = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      rows.push(calendarDays.slice(i, i + 7))
    }
    return rows
  }, [calendarDays])

  return (
    <div className="flex flex-col h-full">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface sticky top-0 z-10">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-medium text-muted-foreground uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-rows-[repeat(auto-fill,minmax(0,1fr))]">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-border/50 last:border-b-0">
            {week.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const dayAppts = appointmentsByDate.get(dateStr) || []
              const isCurrentMonth = isSameMonth(day, selectedDate)
              const today = isToday(day)

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => onDayClick(day)}
                  className={cn(
                    'relative flex flex-col items-start p-1.5 min-h-[80px] border-r border-border/30 last:border-r-0 transition-colors hover:bg-primary/5 cursor-pointer text-left',
                    !isCurrentMonth && 'opacity-40'
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1',
                      today && 'bg-primary text-primary-foreground',
                      !today && isCurrentMonth && 'text-foreground',
                      !today && !isCurrentMonth && 'text-muted-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Appointment indicators */}
                  <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                    {dayAppts.slice(0, 3).map((appt) => (
                      <div
                        key={appt.id}
                        className={cn(
                          'flex items-center gap-1 rounded px-1 py-0 text-[10px] truncate',
                          appt.status === 'scheduled' && 'bg-primary/10 text-primary',
                          appt.status === 'completed' && 'bg-success/10 text-success',
                          appt.status === 'cancelled' && 'bg-muted text-muted-foreground',
                          appt.status === 'no_show' && 'bg-destructive/10 text-destructive'
                        )}
                      >
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            STATUS_DOT_COLORS[appt.status]
                          )}
                        />
                        <span className="truncate">
                          {appt.patient?.full_name?.split(' ')[0] ?? 'Paciente'}
                        </span>
                      </div>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="text-[10px] text-muted-foreground pl-1">
                        +{dayAppts.length - 3} mais
                      </span>
                    )}
                  </div>

                  {/* Dot summary for small sizes */}
                  {dayAppts.length > 0 && (
                    <div className="flex gap-0.5 mt-auto pt-1 md:hidden">
                      {dayAppts.slice(0, 5).map((appt) => (
                        <span
                          key={appt.id}
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            STATUS_DOT_COLORS[appt.status]
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
