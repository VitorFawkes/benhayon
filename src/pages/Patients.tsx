import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import PatientCard from '@/components/patients/PatientCard'
import PatientFilters from '@/components/patients/PatientFilters'
import PatientForm from '@/components/patients/PatientForm'
import { usePatients } from '@/hooks/usePatients'
import type { PatientStatus, PatientPaymentType } from '@/types'

export default function Patients() {
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PatientStatus | null>(null)
  const [typeFilter, setTypeFilter] = useState<PatientPaymentType | null>(null)

  // Debounce search
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedSearch(value)
      }, 300)
    },
    []
  )

  const { data: patients, isLoading } = usePatients({
    status: statusFilter,
    payment_type: typeFilter,
    search: debouncedSearch || undefined,
  })

  const resultCount = patients?.length ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pacientes</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo paciente
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <PatientFilters
          search={search}
          onSearchChange={handleSearchChange}
          status={statusFilter}
          onStatusChange={setStatusFilter}
          paymentType={typeFilter}
          onPaymentTypeChange={setTypeFilter}
          resultCount={resultCount}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-surface p-4 space-y-3"
            >
              <div className="flex justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && resultCount === 0 && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-foreground mb-1">
            Nenhum paciente encontrado
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {debouncedSearch || statusFilter || typeFilter
              ? 'Tente ajustar os filtros para encontrar pacientes.'
              : 'Cadastre seu primeiro paciente para começar.'}
          </p>
          {!debouncedSearch && !statusFilter && !typeFilter && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Cadastrar paciente
            </Button>
          )}
        </div>
      )}

      {/* Patient grid */}
      {!isLoading && resultCount > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {patients!.map((patient, index) => (
            <PatientCard key={patient.id} patient={patient} index={index} />
          ))}
        </div>
      )}

      {/* Create form dialog */}
      <PatientForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="create"
      />
    </motion.div>
  )
}
