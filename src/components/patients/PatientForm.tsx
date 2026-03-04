import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
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
import { useCreatePatient, useUpdatePatient } from '@/hooks/usePatients'
import { useClinics, useCreateClinic } from '@/hooks/useClinics'
import { PATIENT_STATUS_LABELS } from '@/constants'
import type { Patient, PatientStatus, PatientPaymentType } from '@/types'

// ─── Schema ───

const patientSchema = z.object({
  full_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z
    .string()
    .regex(/^\+55\d{10,11}$/, 'Telefone deve estar no formato +55XXXXXXXXXXX'),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional(),
  session_value: z.coerce
    .number({ message: 'Informe um valor válido' })
    .positive('Valor deve ser positivo'),
  payment_type: z.enum(['particular', 'clinic'] as const),
  clinic_id: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'paused'] as const),
  notes: z.string().nullable().optional(),
})

type PatientFormData = z.infer<typeof patientSchema>

// ─── Props ───

interface PatientFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  patient?: Patient | null
  onSuccess?: () => void
}

// ─── Helpers ───

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return '+55'
  if (!digits.startsWith('55')) {
    const withPrefix = '55' + digits
    return '+' + withPrefix.slice(0, 13)
  }
  return '+' + digits.slice(0, 13)
}

function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

// ─── Component ───

export default function PatientForm({
  open,
  onOpenChange,
  mode,
  patient,
  onSuccess,
}: PatientFormProps) {
  const createPatient = useCreatePatient()
  const updatePatient = useUpdatePatient()
  const { data: clinics = [] } = useClinics()
  const createClinic = useCreateClinic()

  const [showNewClinic, setShowNewClinic] = useState(false)
  const [newClinicName, setNewClinicName] = useState('')
  const [currencyDisplay, setCurrencyDisplay] = useState(
    patient ? formatCurrencyInput(String(Math.round(patient.session_value * 100))) : ''
  )

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema) as any,
    defaultValues: {
      full_name: patient?.full_name ?? '',
      phone: patient?.phone ?? '+55',
      email: patient?.email ?? '',
      session_value: patient?.session_value ?? 0,
      payment_type: patient?.payment_type ?? 'particular',
      clinic_id: patient?.clinic_id ?? null,
      status: patient?.status ?? 'active',
      notes: patient?.notes ?? '',
    },
  })

  // Reset form when dialog opens or patient changes
  useEffect(() => {
    if (open) {
      reset({
        full_name: patient?.full_name ?? '',
        phone: patient?.phone ?? '+55',
        email: patient?.email ?? '',
        session_value: patient?.session_value ?? 0,
        payment_type: patient?.payment_type ?? 'particular',
        clinic_id: patient?.clinic_id ?? null,
        status: patient?.status ?? 'active',
        notes: patient?.notes ?? '',
      })
      setCurrencyDisplay(
        patient ? formatCurrencyInput(String(Math.round(patient.session_value * 100))) : ''
      )
    }
  }, [open, patient, reset])

  const paymentType = watch('payment_type')

  const onSubmit = async (data: PatientFormData) => {
    try {
      const payload = {
        full_name: data.full_name,
        phone: data.phone,
        email: data.email || null,
        session_value: data.session_value,
        payment_type: data.payment_type,
        clinic_id: data.payment_type === 'clinic' ? (data.clinic_id ?? null) : null,
        status: data.status,
        notes: data.notes || null,
      }

      if (mode === 'create') {
        await createPatient.mutateAsync(payload)
        toast.success('Paciente cadastrado com sucesso!')
      } else {
        await updatePatient.mutateAsync({ id: patient!.id, ...payload })
        toast.success('Paciente atualizado com sucesso!')
      }

      reset()
      setCurrencyDisplay('')
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Erro ao salvar paciente:', error)
      toast.error('Erro ao salvar paciente. Tente novamente.')
    }
  }

  const handleCreateClinic = async () => {
    if (!newClinicName.trim()) return
    try {
      const clinic = await createClinic.mutateAsync({ name: newClinicName.trim() })
      setValue('clinic_id', clinic.id)
      setNewClinicName('')
      setShowNewClinic(false)
      toast.success(`Clínica "${clinic.name}" criada!`)
    } catch (error) {
      console.error('Erro ao criar clínica:', error)
      toast.error('Erro ao criar clínica.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Novo Paciente' : 'Editar Paciente'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Preencha os dados do novo paciente.'
              : 'Atualize os dados do paciente.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo *</Label>
            <Input
              id="full_name"
              placeholder="Nome do paciente"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone *</Label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <Input
                  id="phone"
                  placeholder="+5511999999999"
                  value={field.value}
                  onChange={(e) => {
                    const masked = applyPhoneMask(e.target.value)
                    field.onChange(masked)
                  }}
                />
              )}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@exemplo.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Session Value */}
          <div className="space-y-2">
            <Label htmlFor="session_value">Valor da sessão *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="session_value"
                placeholder="0,00"
                className="pl-10"
                value={currencyDisplay}
                onChange={(e) => {
                  const display = formatCurrencyInput(e.target.value)
                  setCurrencyDisplay(display)
                  setValue('session_value', parseCurrencyInput(display), {
                    shouldValidate: true,
                  })
                }}
              />
            </div>
            {errors.session_value && (
              <p className="text-xs text-destructive">{errors.session_value.message}</p>
            )}
          </div>

          {/* Payment Type */}
          <div className="space-y-2">
            <Label>Tipo de pagamento *</Label>
            <Controller
              name="payment_type"
              control={control}
              render={({ field }) => (
                <div className="flex gap-3">
                  {(['particular', 'clinic'] as PatientPaymentType[]).map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        value={type}
                        checked={field.value === type}
                        onChange={() => field.onChange(type)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">
                        {type === 'particular' ? 'Particular' : 'Clínica'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Clinic Select (only when clinic type) */}
          {paymentType === 'clinic' && (
            <div className="space-y-2">
              <Label>Clínica</Label>
              <Controller
                name="clinic_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(val) => field.onChange(val || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a clínica" />
                    </SelectTrigger>
                    <SelectContent>
                      {clinics.map((clinic) => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              {/* Inline create clinic */}
              {!showNewClinic ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-primary"
                  onClick={() => setShowNewClinic(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova clínica
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome da clínica"
                    value={newClinicName}
                    onChange={(e) => setNewClinicName(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    onClick={handleCreateClinic}
                    disabled={createClinic.isPending || !newClinicName.trim()}
                  >
                    {createClinic.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Criar'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      setShowNewClinic(false)
                      setNewClinicName('')
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PATIENT_STATUS_LABELS) as [PatientStatus, string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações sobre o paciente..."
              rows={3}
              {...register('notes')}
            />
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {mode === 'create' ? 'Cadastrar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
