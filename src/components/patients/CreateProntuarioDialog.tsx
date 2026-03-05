import { useState, useEffect } from 'react'
import { FileText, ArrowLeft, Calendar, Clock, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { usePatients } from '@/hooks/usePatients'
import { useCompletedWithoutNotes } from '@/hooks/useAppointments'
import { formatDate, formatTime } from '@/lib/formatters'
import { appointmentToTarget } from '@/lib/utils'
import type { SessionNoteTarget } from '@/types'

interface CreateProntuarioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when user selects an appointment — parent should open SessionNoteDialog */
  onSelectTarget: (target: SessionNoteTarget) => void
}

export default function CreateProntuarioDialog({
  open,
  onOpenChange,
  onSelectTarget,
}: CreateProntuarioDialogProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const { data: patients, isLoading: loadingPatients } = usePatients()
  const { data: appointments, isLoading: loadingAppointments } = useCompletedWithoutNotes(
    open ? selectedPatientId : null
  )

  // Reset when dialog closes
  useEffect(() => {
    if (!open) setSelectedPatientId(null)
  }, [open])

  function handleSelectAppointment(appointmentId: string) {
    const apt = appointments?.find((a) => a.id === appointmentId)
    if (!apt) return
    onOpenChange(false)
    // Small delay so Radix close animation finishes before opening the next dialog
    setTimeout(() => onSelectTarget(appointmentToTarget(apt)), 150)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Criar Prontuário
          </DialogTitle>
          <DialogDescription>
            Selecione o paciente e a sessão para registrar o prontuário.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Patient */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Paciente
            </label>
            {loadingPatients ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pacientes...
              </div>
            ) : (
              <Select
                value={selectedPatientId ?? ''}
                onValueChange={(v) => setSelectedPatientId(v || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Step 2: Session (only shows when patient is selected) */}
          {selectedPatientId && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">
                  Sessão concluída
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedPatientId(null)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Trocar paciente
                </button>
              </div>

              {loadingAppointments ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando sessões...
                </div>
              ) : !appointments || appointments.length === 0 ? (
                <div className="text-center py-6 bg-muted/30 rounded-lg">
                  <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sessão concluída sem prontuário.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Todas as sessões já possuem prontuário ou não há sessões concluídas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {appointments.map((apt) => (
                    <button
                      key={apt.id}
                      type="button"
                      onClick={() => handleSelectAppointment(apt.id)}
                      className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {formatDate(apt.date)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                          </p>
                        </div>
                        <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                          Selecionar
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
