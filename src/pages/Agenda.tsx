import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  LayoutGrid,
  List,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgendaStore } from '@/stores/agendaStore'
import { useAppointments } from '@/hooks/useAppointments'
import { DayView } from '@/components/agenda/DayView'
import { WeekView } from '@/components/agenda/WeekView'
import { MonthView } from '@/components/agenda/MonthView'
import { AppointmentForm } from '@/components/agenda/AppointmentForm'
import { cn } from '@/lib/utils'
import type { Appointment } from '@/types'

// ─── View Mode Config ───

const VIEW_MODES = [
  { key: 'day' as const, label: 'Dia', icon: List },
  { key: 'week' as const, label: 'Semana', icon: LayoutGrid },
  { key: 'month' as const, label: 'Mês', icon: CalendarIcon },
]

export default function Agenda() {
  const { selectedDate, viewMode, setSelectedDate, setViewMode } = useAgendaStore()

  // Dialog states
  const [appointmentFormOpen, setAppointmentFormOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [defaultFormDate, setDefaultFormDate] = useState<string>('')
  const [defaultFormTime, setDefaultFormTime] = useState<string>('')

  // Calculate date range for data fetching
  const { startDate, endDate } = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return {
          startDate: format(selectedDate, 'yyyy-MM-dd'),
          endDate: format(selectedDate, 'yyyy-MM-dd'),
        }
      case 'week': {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
        return {
          startDate: format(weekStart, 'yyyy-MM-dd'),
          endDate: format(weekEnd, 'yyyy-MM-dd'),
        }
      }
      case 'month': {
        // Fetch entire month + edges for calendar grid
        const monthStart = startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 })
        const monthEnd = endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 })
        return {
          startDate: format(monthStart, 'yyyy-MM-dd'),
          endDate: format(monthEnd, 'yyyy-MM-dd'),
        }
      }
    }
  }, [selectedDate, viewMode])

  const { data: appointments = [], isLoading } = useAppointments(startDate, endDate)

  // Navigation
  function goToToday() {
    setSelectedDate(new Date())
  }

  function goBack() {
    switch (viewMode) {
      case 'day':
        setSelectedDate(subDays(selectedDate, 1))
        break
      case 'week':
        setSelectedDate(subWeeks(selectedDate, 1))
        break
      case 'month':
        setSelectedDate(subMonths(selectedDate, 1))
        break
    }
  }

  function goForward() {
    switch (viewMode) {
      case 'day':
        setSelectedDate(addDays(selectedDate, 1))
        break
      case 'week':
        setSelectedDate(addWeeks(selectedDate, 1))
        break
      case 'month':
        setSelectedDate(addMonths(selectedDate, 1))
        break
    }
  }

  // Title based on view mode
  const title = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
      case 'week': {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
        const startStr = format(weekStart, 'd', { locale: ptBR })
        const endStr = format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })
        return `${startStr} - ${endStr}`
      }
      case 'month':
        return format(selectedDate, 'MMMM yyyy', { locale: ptBR })
    }
  }, [selectedDate, viewMode])

  // Handlers for slot/appointment clicks
  const handleSlotClick = useCallback((date: string, time: string) => {
    setEditingAppointment(null)
    setDefaultFormDate(date)
    setDefaultFormTime(time)
    setAppointmentFormOpen(true)
  }, [])

  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    setEditingAppointment(appointment)
    setDefaultFormDate('')
    setDefaultFormTime('')
    setAppointmentFormOpen(true)
  }, [])

  const handleMonthDayClick = useCallback(
    (date: Date) => {
      setSelectedDate(date)
      setViewMode('day')
    },
    [setSelectedDate, setViewMode]
  )

  function handleNewAppointment() {
    setEditingAppointment(null)
    setDefaultFormDate(format(selectedDate, 'yyyy-MM-dd'))
    setDefaultFormTime('09:00')
    setAppointmentFormOpen(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>

          {/* View mode toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {VIEW_MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.95]',
                  viewMode === key
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goBack} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="h-8 text-xs">
              Hoje
            </Button>
            <Button variant="outline" size="icon" onClick={goForward} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Action buttons */}
          <Button size="sm" onClick={handleNewAppointment} className="h-8">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Novo Agendamento</span>
          </Button>
        </div>
      </div>

      {/* Current date range title */}
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-foreground capitalize">{title}</h2>
      </div>

      {/* Content */}
      <div className="flex-1 bg-surface border border-border rounded-xl overflow-hidden min-h-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {viewMode === 'day' && (
              <DayView
                date={selectedDate}
                appointments={appointments}
                onSlotClick={handleSlotClick}
                onAppointmentClick={handleAppointmentClick}
              />
            )}
            {viewMode === 'week' && (
              <WeekView
                selectedDate={selectedDate}
                appointments={appointments}
                onSlotClick={handleSlotClick}
                onAppointmentClick={handleAppointmentClick}
              />
            )}
            {viewMode === 'month' && (
              <MonthView
                selectedDate={selectedDate}
                appointments={appointments}
                onDayClick={handleMonthDayClick}
              />
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <AppointmentForm
        open={appointmentFormOpen}
        onOpenChange={setAppointmentFormOpen}
        appointment={editingAppointment}
        defaultDate={defaultFormDate}
        defaultTime={defaultFormTime}
      />

    </motion.div>
  )
}
