import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, addMinutes, addWeeks, addDays, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePatients } from '@/hooks/usePatients'
import { useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from '@/hooks/useAppointments'
import { useCreateRecurringSchedule } from '@/hooks/useRecurringSchedules'
import { APPOINTMENT_STATUS_LABELS, DAY_OF_WEEK_LABELS } from '@/constants'
import type { Appointment, AppointmentStatus, RecurringFrequency } from '@/types'

// ─── Schema ───

const appointmentSchema = z.object({
  patient_id: z.string().min(1, 'Selecione um paciente'),
  date: z.string().min(1, 'Selecione uma data'),
  start_time: z.string().min(1, 'Informe o horário de início'),
  end_time: z.string().min(1, 'Informe o horário de término'),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']),
  notes: z.string().nullable(),
}).refine(
  (data) => data.end_time > data.start_time,
  { message: 'O horário de término deve ser após o início', path: ['end_time'] }
)

type AppointmentFormData = z.infer<typeof appointmentSchema>

// ─── Frequency labels ───

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
}

// ─── Props ───

interface AppointmentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment?: Appointment | null
  defaultDate?: string
  defaultTime?: string
}

export function AppointmentForm({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  defaultTime,
}: AppointmentFormProps) {
  const isEdit = !!appointment
  const [patientSearch, setPatientSearch] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const { data: patients = [] } = usePatients({ status: 'active', search: patientSearch })
  const createMutation = useCreateAppointment()
  const updateMutation = useUpdateAppointment()
  const deleteMutation = useDeleteAppointment()
  const createRecurringMutation = useCreateRecurringSchedule()

  const defaultEndTime = useMemo(() => {
    const time = defaultTime || '09:00'
    try {
      const parsed = parse(time, 'HH:mm', new Date())
      return format(addMinutes(parsed, 50), 'HH:mm')
    } catch {
      return '09:50'
    }
  }, [defaultTime])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: '',
      date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
      start_time: defaultTime || '09:00',
      end_time: defaultEndTime,
      status: 'scheduled',
      notes: null,
    },
  })

  const startTime = watch('start_time')

  // Auto-set end_time when start_time changes (only in create mode)
  useEffect(() => {
    if (!isEdit && startTime) {
      try {
        const parsed = parse(startTime, 'HH:mm', new Date())
        const end = format(addMinutes(parsed, 50), 'HH:mm')
        setValue('end_time', end)
      } catch {
        // Ignore invalid time
      }
    }
  }, [startTime, isEdit, setValue])

  // Reset form when dialog opens or appointment changes
  useEffect(() => {
    if (open) {
      if (appointment) {
        reset({
          patient_id: appointment.patient_id,
          date: appointment.date,
          start_time: appointment.start_time.slice(0, 5),
          end_time: appointment.end_time.slice(0, 5),
          status: appointment.status,
          notes: appointment.notes,
        })
        setIsRecurring(false)
      } else {
        const dateStr = defaultDate || format(new Date(), 'yyyy-MM-dd')
        reset({
          patient_id: '',
          date: dateStr,
          start_time: defaultTime || '09:00',
          end_time: defaultEndTime,
          status: 'scheduled',
          notes: null,
        })
        setIsRecurring(false)
        setFrequency('weekly')
        setDayOfWeek(new Date(dateStr + 'T00:00:00').getDay())
        setStartsAt(dateStr)
        setEndsAt('')
      }
      setPatientSearch('')
    }
  }, [open, appointment, defaultDate, defaultTime, defaultEndTime, reset])

  // Update day_of_week when date changes (for single appointment → recurring context)
  const watchedDate = watch('date')
  useEffect(() => {
    if (watchedDate && !isEdit) {
      const d = new Date(watchedDate + 'T00:00:00')
      if (!isNaN(d.getTime())) {
        setDayOfWeek(d.getDay())
        setStartsAt(watchedDate)
      }
    }
  }, [watchedDate, isEdit])

  // Preview for recurring mode
  const preview = useMemo(() => {
    if (!isRecurring || !startsAt) return null

    const stepWeeks = frequency === 'weekly' ? 1 : frequency === 'biweekly' ? 2 : 4

    let current = new Date(startsAt + 'T00:00:00')
    while (current.getDay() !== dayOfWeek) {
      current = addDays(current, 1)
    }

    const totalWeeks = 8
    let count = 0
    let lastDate = current

    for (let i = 0; i < totalWeeks; i++) {
      const date = addWeeks(current, i * stepWeeks)
      if (endsAt && date > new Date(endsAt + 'T23:59:59')) break
      count++
      lastDate = date
    }

    return {
      count,
      lastDate: format(lastDate, "dd/MM/yyyy", { locale: ptBR }),
    }
  }, [isRecurring, frequency, startsAt, endsAt, dayOfWeek])

  async function onSubmit(data: AppointmentFormData) {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: appointment!.id,
          patient_id: data.patient_id,
          date: data.date,
          start_time: data.start_time,
          end_time: data.end_time,
          status: data.status,
          notes: data.notes || null,
        })
        toast.success('Agendamento atualizado com sucesso')
      } else if (isRecurring) {
        const result = await createRecurringMutation.mutateAsync({
          patient_id: data.patient_id,
          day_of_week: dayOfWeek,
          start_time: data.start_time,
          end_time: data.end_time,
          frequency,
          starts_at: startsAt,
          ends_at: endsAt || null,
        })
        toast.success(
          `Recorrência criada com ${result.appointmentsCreated} agendamentos`
        )
      } else {
        await createMutation.mutateAsync({
          patient_id: data.patient_id,
          date: data.date,
          start_time: data.start_time,
          end_time: data.end_time,
          status: data.status,
          notes: data.notes || null,
        })
        toast.success('Agendamento criado com sucesso')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error('Erro ao salvar agendamento')
      console.error(error)
    }
  }

  async function handleDelete() {
    if (!appointment) return
    try {
      await deleteMutation.mutateAsync(appointment.id)
      toast.success('Agendamento excluído')
      onOpenChange(false)
    } catch (error) {
      toast.error('Erro ao excluir agendamento')
      console.error(error)
    }
  }

  const statusOptions = Object.entries(APPOINTMENT_STATUS_LABELS) as [AppointmentStatus, string][]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Altere as informações do agendamento.'
              : 'Preencha os dados para criar um novo agendamento.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Paciente */}
          <div className="space-y-2">
            <Label htmlFor="patient_id">Paciente</Label>
            <Input
              placeholder="Buscar paciente..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="mb-2"
            />
            <Select
              value={watch('patient_id')}
              onValueChange={(value) => setValue('patient_id', value, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um paciente" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.full_name}
                  </SelectItem>
                ))}
                {patients.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhum paciente encontrado
                  </div>
                )}
              </SelectContent>
            </Select>
            {errors.patient_id && (
              <p className="text-xs text-destructive">{errors.patient_id.message}</p>
            )}
          </div>

          {/* Data (apenas modo único) */}
          {!isRecurring && (
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input type="date" {...register('date')} />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date.message}</p>
              )}
            </div>
          )}

          {/* Horários */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Início</Label>
              <Input type="time" {...register('start_time')} />
              {errors.start_time && (
                <p className="text-xs text-destructive">{errors.start_time.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">Término</Label>
              <Input type="time" {...register('end_time')} />
              {errors.end_time && (
                <p className="text-xs text-destructive">{errors.end_time.message}</p>
              )}
            </div>
          </div>

          {/* Toggle Recorrente (apenas no modo criação) */}
          {!isEdit && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="recurring-toggle" className="text-sm font-medium">
                  Recorrente
                </Label>
                <p className="text-xs text-muted-foreground">
                  Criar agendamentos automaticamente
                </p>
              </div>
              <Switch
                id="recurring-toggle"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
            </div>
          )}

          {/* Campos de recorrência */}
          {!isEdit && isRecurring && (
            <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
              {/* Dia da semana */}
              <div className="space-y-2">
                <Label>Dia da Semana</Label>
                <Select
                  value={String(dayOfWeek)}
                  onValueChange={(value) => setDayOfWeek(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OF_WEEK_LABELS.map((label, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Frequência */}
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={frequency}
                  onValueChange={(value) => setFrequency(value as RecurringFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(FREQUENCY_LABELS) as [RecurringFrequency, string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Datas de início e término */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>A partir de</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Até</Label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Opcional</p>
                </div>
              </div>

              {/* Preview */}
              {preview && preview.count > 0 && (
                <p className="text-sm text-foreground">
                  Serão criados <strong>{preview.count} agendamentos</strong> até{' '}
                  <strong>{preview.lastDate}</strong>
                </p>
              )}
            </div>
          )}

          {/* Status (apenas no modo edição) */}
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(value) =>
                  setValue('status', value as AppointmentStatus, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              {...register('notes')}
              placeholder="Observações sobre a sessão..."
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                Excluir
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Salvando...'
                : isEdit
                  ? 'Salvar'
                  : isRecurring
                    ? 'Criar Recorrência'
                    : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
