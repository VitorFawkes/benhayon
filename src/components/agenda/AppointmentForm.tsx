import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, addMinutes, parse } from 'date-fns'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePatients } from '@/hooks/usePatients'
import { useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from '@/hooks/useAppointments'
import { APPOINTMENT_STATUS_LABELS } from '@/constants'
import type { Appointment, AppointmentStatus } from '@/types'

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

  const { data: patients = [] } = usePatients({ status: 'active', search: patientSearch })
  const createMutation = useCreateAppointment()
  const updateMutation = useUpdateAppointment()
  const deleteMutation = useDeleteAppointment()

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
      } else {
        reset({
          patient_id: '',
          date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
          start_time: defaultTime || '09:00',
          end_time: defaultEndTime,
          status: 'scheduled',
          notes: null,
        })
      }
      setPatientSearch('')
    }
  }, [open, appointment, defaultDate, defaultTime, defaultEndTime, reset])

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

          {/* Data */}
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input type="date" {...register('date')} />
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date.message}</p>
            )}
          </div>

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
              {isSubmitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
