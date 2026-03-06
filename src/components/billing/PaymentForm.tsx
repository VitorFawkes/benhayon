import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { CreditCard, Loader2, Upload, X } from 'lucide-react'
import { formatCurrency, formatMonthYear } from '@/lib/formatters'
import { PAYMENT_METHOD_LABELS } from '@/constants'
import { usePatients } from '@/hooks/usePatients'
import { useInvoices } from '@/hooks/useInvoices'
import { useCreatePayment } from '@/hooks/usePayments'
import type { PaymentMethodType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Schema ───

const paymentSchema = z.object({
  patient_id: z.string().min(1, 'Selecione um paciente'),
  invoice_id: z.string().nullable().optional(),
  amount: z.number().positive('Valor deve ser maior que zero'),
  payment_date: z.string().min(1, 'Informe a data do pagamento'),
  payment_method: z.enum(['pix', 'cash', 'transfer', 'card', 'other'] as const, {
    message: 'Selecione o método de pagamento',
  }),
  notes: z.string().nullable().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

interface PaymentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPatientId?: string
  defaultInvoiceId?: string
}

export function PaymentForm({
  open,
  onOpenChange,
  defaultPatientId,
  defaultInvoiceId,
}: PaymentFormProps) {
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [patientSearch, setPatientSearch] = useState('')

  const { data: patients = [] } = usePatients({ status: 'active', search: patientSearch || undefined })
  const createPayment = useCreatePayment()

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      patient_id: defaultPatientId || '',
      invoice_id: defaultInvoiceId || null,
      amount: 0,
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'pix',
      notes: null,
    },
  })

  const selectedPatientId = watch('patient_id')
  const selectedInvoiceId = watch('invoice_id')
  const currentAmount = watch('amount')

  // Buscar cobranças do paciente selecionado (pendentes ou parciais)
  const { data: patientInvoices = [] } = useInvoices({
    patient_id: selectedPatientId || undefined,
    status: ['pending', 'partial'],
  })

  // Pre-fill amount when invoice is selected
  useEffect(() => {
    if (selectedInvoiceId) {
      const invoice = patientInvoices.find((inv) => inv.id === selectedInvoiceId)
      if (invoice) {
        const remaining = invoice.total_amount - invoice.amount_paid
        setValue('amount', remaining)
      }
    }
  }, [selectedInvoiceId, patientInvoices, setValue])

  // Auto-select first pending invoice when patient changes
  useEffect(() => {
    if (patientInvoices.length > 0) {
      setValue('invoice_id', patientInvoices[0].id)
    } else {
      setValue('invoice_id', null)
    }
  }, [selectedPatientId, patientInvoices, setValue])

  async function onSubmit(values: PaymentFormValues) {
    try {
      await createPayment.mutateAsync({
        ...values,
        receipt_file: receiptFile,
      })
      toast.success('Pagamento registrado com sucesso!')
      handleClose()
    } catch (error) {
      toast.error('Erro ao registrar pagamento. Tente novamente.')
    }
  }

  function handleClose() {
    reset()
    setReceiptFile(null)
    setPatientSearch('')
    onOpenChange(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo deve ter no máximo 10MB')
        return
      }
      setReceiptFile(file)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Registrar Pagamento
          </DialogTitle>
          <DialogDescription>
            Registre um novo pagamento manualmente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Paciente */}
          <div className="space-y-1.5">
            <Label htmlFor="patient">Paciente</Label>
            <Controller
              control={control}
              name="patient_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5">
                      <Input
                        placeholder="Buscar paciente..."
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name}
                      </SelectItem>
                    ))}
                    {patients.length === 0 && (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum paciente encontrado
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.patient_id && (
              <p className="text-xs text-destructive">{errors.patient_id.message}</p>
            )}
          </div>

          {/* Cobrança (opcional) */}
          {selectedPatientId && (
            <div className="space-y-1.5">
              <Label htmlFor="invoice">Referente a</Label>
              <Controller
                control={control}
                name="invoice_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? 'none'}
                    onValueChange={(val) =>
                      field.onChange(val === 'none' ? null : val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vincular a uma cobrança" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Avulso (sem cobrança mensal)</SelectItem>
                      {patientInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          <span className="capitalize">
                            {formatMonthYear(inv.reference_month + 'T12:00:00')}
                          </span>
                          {' - '}
                          Falta {formatCurrency(inv.total_amount - inv.amount_paid)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {patientInvoices.length > 0 && !selectedInvoiceId && (
                <p className="text-xs text-warning">
                  Este paciente tem {patientInvoices.length} cobrança(s) pendente(s).
                </p>
              )}
            </div>
          )}

          {/* Valor */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              {...register('amount', { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
            {(() => {
              if (!selectedInvoiceId) return null
              const invoice = patientInvoices.find((inv) => inv.id === selectedInvoiceId)
              if (!invoice) return null
              const remaining = invoice.total_amount - invoice.amount_paid
              if (currentAmount > remaining) {
                return (
                  <p className="text-xs text-warning">
                    Valor excede o saldo restante de {formatCurrency(remaining)}
                  </p>
                )
              }
              return (
                <p className="text-xs text-muted-foreground">
                  Saldo restante: {formatCurrency(remaining)}
                </p>
              )
            })()}
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <Label htmlFor="payment_date">Data do pagamento</Label>
            <Input
              id="payment_date"
              type="date"
              {...register('payment_date')}
            />
            {errors.payment_date && (
              <p className="text-xs text-destructive">{errors.payment_date.message}</p>
            )}
          </div>

          {/* Método de pagamento */}
          <div className="space-y-1.5">
            <Label>Método de pagamento</Label>
            <Controller
              control={control}
              name="payment_method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethodType, string][]).map(
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
            {errors.payment_method && (
              <p className="text-xs text-destructive">{errors.payment_method.message}</p>
            )}
          </div>

          {/* Upload de comprovante */}
          <div className="space-y-1.5">
            <Label>Comprovante (opcional)</Label>
            {receiptFile ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-foreground">
                  {receiptFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setReceiptFile(null)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
                  <Upload className="h-4 w-4" />
                  Clique para enviar comprovante
                </div>
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Anotações sobre o pagamento..."
              rows={2}
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Registrar Pagamento'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
