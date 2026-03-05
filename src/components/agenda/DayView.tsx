import { useMemo, useEffect, useRef, useState } from 'react'
import { format, isToday, parse, differenceInMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { AppointmentCard } from './AppointmentCard'
import type { Appointment } from '@/types'

// ─── Constants ───

const START_HOUR = 7
const END_HOUR = 22
const HOUR_HEIGHT = 60 // px per hour
const TOTAL_HOURS = END_HOUR - START_HOUR

// ─── Props ───

interface DayViewProps {
  date: Date
  appointments: Appointment[]
  onSlotClick: (date: string, time: string) => void
  onAppointmentClick: (appointment: Appointment) => void
  onNoteClick?: (appointment: Appointment) => void
  noteAppointmentIds?: Set<string>
}

export function DayView({ date, appointments, onSlotClick, onAppointmentClick, onNoteClick, noteAppointmentIds }: DayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(new Date())

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to 8am on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT
    }
  }, [])

  // Filter appointments for this day
  const dayAppointments = useMemo(() => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return appointments.filter((a) => a.date === dateStr)
  }, [appointments, date])

  // Calculate position for an appointment
  function getAppointmentStyle(appointment: Appointment) {
    const start = parse(appointment.start_time.slice(0, 5), 'HH:mm', date)
    const end = parse(appointment.end_time.slice(0, 5), 'HH:mm', date)

    const startMinutes = (start.getHours() - START_HOUR) * 60 + start.getMinutes()
    const duration = differenceInMinutes(end, start)

    return {
      top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${Math.max((duration / 60) * HOUR_HEIGHT, 24)}px`,
    }
  }

  // Current time indicator position
  const currentTimePosition = useMemo(() => {
    if (!isToday(date)) return null
    const minutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes()
    if (minutes < 0 || minutes > TOTAL_HOURS * 60) return null
    return (minutes / 60) * HOUR_HEIGHT
  }, [date, now])

  // Generate hour labels
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)

  function handleSlotClick(hour: number) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const time = `${String(hour).padStart(2, '0')}:00`
    onSlotClick(dateStr, time)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface sticky top-0 z-10">
        <div
          className={cn(
            'flex flex-col items-center justify-center w-12 h-12 rounded-xl',
            isToday(date) ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          )}
        >
          <span className="text-[10px] font-medium uppercase leading-none">
            {format(date, 'EEE', { locale: ptBR })}
          </span>
          <span className="text-lg font-bold leading-tight">
            {format(date, 'd')}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </span>
      </div>

      {/* Time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
        <div className="relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Hour lines */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute w-full flex"
              style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
            >
              {/* Time label */}
              <div className="w-16 shrink-0 pr-3 text-right">
                <span className="text-xs text-muted-foreground -mt-2 inline-block">
                  {`${String(hour).padStart(2, '0')}:00`}
                </span>
              </div>
              {/* Grid line + clickable slot */}
              <button
                type="button"
                className="flex-1 border-t border-border/50 hover:bg-primary/5 active:bg-primary/10 transition-colors cursor-pointer"
                style={{ height: `${HOUR_HEIGHT}px` }}
                onClick={() => handleSlotClick(hour)}
                aria-label={`Agendar às ${hour}:00`}
              />
            </div>
          ))}

          {/* Appointments */}
          <div className="absolute left-16 right-2 top-0">
            {dayAppointments.map((appointment) => {
              const style = getAppointmentStyle(appointment)
              return (
                <div
                  key={appointment.id}
                  className="absolute left-0 right-0 px-1"
                  style={{ top: style.top, height: style.height }}
                >
                  <AppointmentCard
                    appointment={appointment}
                    onClick={() => onAppointmentClick(appointment)}
                    onNoteClick={onNoteClick}
                    hasNote={noteAppointmentIds?.has(appointment.id)}
                  />
                </div>
              )
            })}
          </div>

          {/* Current time indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-14 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1" />
              <div className="flex-1 h-0.5 bg-destructive" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
