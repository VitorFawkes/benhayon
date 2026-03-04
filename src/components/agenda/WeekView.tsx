import { useMemo, useEffect, useRef, useState } from 'react'
import {
  format,
  isToday,
  startOfWeek,
  addDays,
  parse,
  differenceInMinutes,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { AppointmentCard } from './AppointmentCard'
import type { Appointment } from '@/types'

// ─── Constants ───

const START_HOUR = 7
const END_HOUR = 22
const HOUR_HEIGHT = 60
const TOTAL_HOURS = END_HOUR - START_HOUR

// ─── Props ───

interface WeekViewProps {
  selectedDate: Date
  appointments: Appointment[]
  onSlotClick: (date: string, time: string) => void
  onAppointmentClick: (appointment: Appointment) => void
}

export function WeekView({
  selectedDate,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
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

  // Generate week days (Monday start)
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
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

  // Calculate position for an appointment
  function getAppointmentStyle(appointment: Appointment, day: Date) {
    const start = parse(appointment.start_time.slice(0, 5), 'HH:mm', day)
    const end = parse(appointment.end_time.slice(0, 5), 'HH:mm', day)

    const startMinutes = (start.getHours() - START_HOUR) * 60 + start.getMinutes()
    const duration = differenceInMinutes(end, start)

    return {
      top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${Math.max((duration / 60) * HOUR_HEIGHT, 20)}px`,
    }
  }

  // Current time indicator
  const currentTimePosition = useMemo(() => {
    const minutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes()
    if (minutes < 0 || minutes > TOTAL_HOURS * 60) return null
    return (minutes / 60) * HOUR_HEIGHT
  }, [now])

  const todayColumnIndex = useMemo(
    () => weekDays.findIndex((d) => isToday(d)),
    [weekDays]
  )

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)

  return (
    <div className="flex flex-col h-full">
      {/* Week header */}
      <div className="flex border-b border-border bg-surface sticky top-0 z-10">
        {/* Time gutter spacer */}
        <div className="w-14 shrink-0" />
        {/* Day columns */}
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex-1 flex flex-col items-center py-2 border-l border-border/50',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              {format(day, 'EEE', { locale: ptBR })}
            </span>
            <span
              className={cn(
                'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full',
                isToday(day) && 'bg-primary text-primary-foreground'
              )}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
        <div className="relative flex" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Time labels column */}
          <div className="w-14 shrink-0 relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full pr-2 text-right"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                <span className="text-[10px] text-muted-foreground -mt-2 inline-block">
                  {`${String(hour).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns with grid */}
          {weekDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayAppts = appointmentsByDate.get(dateStr) || []

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 relative border-l border-border/50',
                  isToday(day) && 'bg-primary/[0.02]'
                )}
              >
                {/* Hour slots */}
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className="absolute w-full border-t border-border/30 hover:bg-primary/5 transition-colors cursor-pointer"
                    style={{
                      top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`,
                      height: `${HOUR_HEIGHT}px`,
                    }}
                    onClick={() => onSlotClick(dateStr, `${String(hour).padStart(2, '0')}:00`)}
                    aria-label={`Agendar ${format(day, 'dd/MM')} às ${hour}:00`}
                  />
                ))}

                {/* Appointments */}
                {dayAppts.map((appointment) => {
                  const style = getAppointmentStyle(appointment, day)
                  return (
                    <div
                      key={appointment.id}
                      className="absolute left-0.5 right-0.5 z-10"
                      style={{ top: style.top, height: style.height }}
                    >
                      <AppointmentCard
                        appointment={appointment}
                        onClick={() => onAppointmentClick(appointment)}
                        compact
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Current time indicator */}
          {currentTimePosition !== null && todayColumnIndex >= 0 && (
            <div
              className="absolute z-20 pointer-events-none flex items-center"
              style={{
                top: `${currentTimePosition}px`,
                left: '3.5rem',
                right: 0,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-destructive -ml-1" />
              <div className="flex-1 h-[1.5px] bg-destructive" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
