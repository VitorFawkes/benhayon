import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PATIENT_STATUS_LABELS } from '@/constants'
import type { PatientStatus, PatientPaymentType } from '@/types'

interface PatientFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  status: PatientStatus | null
  onStatusChange: (value: PatientStatus | null) => void
  paymentType: PatientPaymentType | null
  onPaymentTypeChange: (value: PatientPaymentType | null) => void
  resultCount: number
}

const statusOptions: { value: PatientStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'active', label: PATIENT_STATUS_LABELS.active },
  { value: 'inactive', label: PATIENT_STATUS_LABELS.inactive },
  { value: 'paused', label: PATIENT_STATUS_LABELS.paused },
]

const typeOptions: { value: PatientPaymentType | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'particular', label: 'Particular' },
  { value: 'clinic', label: 'Convênio' },
]

export default function PatientFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  paymentType,
  onPaymentTypeChange,
  resultCount,
}: PatientFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter rows */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground mr-1">Status:</span>
          {statusOptions.map((option) => (
            <Button
              key={option.label}
              variant={status === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onStatusChange(option.value)}
              className={cn(
                'h-8 text-xs',
                status === option.value && 'pointer-events-none'
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Payment type filter */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground mr-1">Tipo:</span>
          {typeOptions.map((option) => (
            <Button
              key={option.label}
              variant={paymentType === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPaymentTypeChange(option.value)}
              className={cn(
                'h-8 text-xs',
                paymentType === option.value && 'pointer-events-none'
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Result count */}
        <span className="ml-auto text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? 'paciente' : 'pacientes'}
        </span>
      </div>
    </div>
  )
}
