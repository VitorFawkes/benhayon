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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePatients } from '@/hooks/usePatients'
import { useCreateRecurringSchedule } from '@/hooks/useRecurringSchedules'
import { DAY_OF_WEEK_LABELS } from '@/constants'
import type { RecurringFrequency } from '@/types'

// ─── Schema ───

const recurringSchema = z.object({
  patient_id: z.string().min(1, 'Selecione um paciente'),
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().min(1, 'Informe o horário de início'),
  end_time: z.string().min(1, 'Informe o horário de término'),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  starts_at: z.string().min(1, 'Selecione a data de início'),
  ends_at: z.string().nullable(),
}).refine(
  (data) => data.end_time > data.start_time,
  { message: 'O horário de término deve ser após o início', path: ['end_time'] }
)

type RecurringFormData = z.infer<typeof recurringSchema>

// ─── Frequency labels ───

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
}

// ─── Props ───

interface RecurringFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecurringForm({ open, onOpenChange }: RecurringFormProps) {
  const [patientSearch, setPatientSearch] = useState('')
  const { data: patients = [] } = usePatients({ status: 'active', search: patientSearch })
  const createMutation = useCreateRecurringSchedule()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecurringFormData>({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      patient_id: '',
      day_of_week: 1,
      start_time: '09:00',
      end_time: '09:50',
      frequency: 'weekly',
      starts_at: format(new Date(), 'yyyy-MM-dd'),
      ends_at: null,
    },
  })

  const startTime = watch('start_time')
  const frequency = watch('frequency')
  const startsAt = watch('starts_at')
  const endsAt = watch('ends_at')
  const dayOfWeek = watch('day_of_week')

  // Auto-set end_time when start_time changes
  useEffect(() => {
    if (startTime) {
      try {
        const parsed = parse(startTime, 'HH:mm', new Date())
        const end = format(addMinutes(parsed, 50), 'HH:mm')
        setValue('end_time', end)
      } catch {
        // Ignore invalid time
      }
    }
  }, [startTime, setValue])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        patient_id: '',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '09:50',
        frequency: 'weekly',
        starts_at: format(new Date(), 'yyyy-MM-dd'),
        ends_at: null,
      })
      setPatientSearch('')
    }
  }, [open, reset])

  // Preview: calculate how many appointments will be created
  const preview = useMemo(() => {
    if (!startsAt) return null

    const stepWeeks = frequency === 'weekly' ? 1 : frequency === 'biweekly' ? 2 : 4

    // Adjust start date to the target day_of_week (same logic as useRecurringSchedules)
    let current = new Date(startsAt)
    while (current.getDay() !== dayOfWeek) {
      current = addDays(current, 1)
    }

    const totalWeeks = 8
    let count = 0
    let lastDate = current

    for (let i = 0; i < totalWeeks; i++) {
      const date = addWeeks(current, i * stepWeeks)
      if (endsAt && date > new Date(endsAt)) break
      count++
      lastDate = date
    }

    return {
      count,
      lastDate: format(lastDate, "dd/MM/yyyy", { locale: ptBR }),
    }
  }, [frequency, startsAt, endsAt, dayOfWeek])

  async function onSubmit(data: RecurringFormData) {
    try {
      const result = await createMutation.mutateAsync({
        patient_id: data.patient_id,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
        frequency: data.frequency,
        starts_at: data.starts_at,
        ends_at: data.ends_at || null,
      })
      toast.success(
        `Recorrência criada com ${result.appointmentsCreated} agendamentos`
      )
      onOpenChange(false)
    } catch (error) {
      toast.error('Erro ao criar recorrência')
      console.error(error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Recorrência</DialogTitle>
          <DialogDescription>
            Configure uma agenda recorrente para o paciente. Os agendamentos serão criados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Paciente */}
          <div className="space-y-2">
            <Label>Paciente</Label>
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

          {/* Dia da semana */}
          <div className="space-y-2">
            <Label>Dia da Semana</Label>
            <Select
              value={String(watch('day_of_week'))}
              onValueChange={(value) => setValue('day_of_week', Number(value), { shouldValidate: true })}
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

          {/* Horários */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="time" {...register('start_time')} />
              {errors.start_time && (
                <p className="text-xs text-destructive">{errors.start_time.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Término</Label>
              <Input type="time" {...register('end_time')} />
              {errors.end_time && (
                <p className="text-xs text-destructive">{errors.end_time.message}</p>
              )}
            </div>
          </div>

          {/* Frequência */}
          <div className="space-y-2">
            <Label>Frequência</Label>
            <Select
              value={watch('frequency')}
              onValueChange={(value) =>
                setValue('frequency', value as RecurringFrequency, { shouldValidate: true })
              }
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

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input type="date" {...register('starts_at')} />
              {errors.starts_at && (
                <p className="text-xs text-destructive">{errors.starts_at.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Data de Término</Label>
              <Input
                type="date"
                {...register('ends_at')}
                placeholder="Sem fim"
              />
              <p className="text-xs text-muted-foreground">Opcional</p>
            </div>
          </div>

          {/* Preview */}
          {preview && preview.count > 0 && (
            <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
              <p className="text-sm text-foreground">
                Serão criados <strong>{preview.count} agendamentos</strong> até{' '}
                <strong>{preview.lastDate}</strong>
                {!endsAt && (
                  <span className="text-muted-foreground"> (sem data final — criando as próximas {preview.count} sessões)</span>
                )}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar Recorrência'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
