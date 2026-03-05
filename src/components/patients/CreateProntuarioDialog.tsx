import { useState, useEffect } from 'react'
import {
  FileText,
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  Link2,
  FileEdit,
  CheckCircle2,
} from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'

import { usePatients } from '@/hooks/usePatients'
import { useAvailableForNotes } from '@/hooks/useAppointments'
import { formatDate, formatTime } from '@/lib/formatters'
import { appointmentToTarget } from '@/lib/utils'
import type { SessionNoteTarget } from '@/types'

type Mode = 'choose' | 'with-session' | 'without-session'

interface CreateProntuarioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when user selects an appointment or chooses standalone — parent should open SessionNoteDialog */
  onSelectTarget: (target: SessionNoteTarget) => void
}

export default function CreateProntuarioDialog({
  open,
  onOpenChange,
  onSelectTarget,
}: CreateProntuarioDialogProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('choose')

  const { data: patients, isLoading: loadingPatients } = usePatients()
  const { data: appointments, isLoading: loadingAppointments } = useAvailableForNotes(
    open && mode === 'with-session' ? selectedPatientId : null
  )

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedPatientId(null)
      setMode('choose')
    }
  }, [open])

  function handleSelectAppointment(appointmentId: string) {
    const apt = appointments?.find((a) => a.id === appointmentId)
    if (!apt) return
    onOpenChange(false)
    setTimeout(() => onSelectTarget(appointmentToTarget(apt)), 150)
  }

  function handleCreateStandalone() {
    if (!selectedPatientId) return
    const patient = patients?.find((p) => p.id === selectedPatientId)
    onOpenChange(false)
    setTimeout(
      () =>
        onSelectTarget({
          appointmentId: null,
          patientId: selectedPatientId,
          patientName: patient?.full_name ?? 'Paciente',
          date: null,
          startTime: null,
          endTime: null,
          status: null,
        }),
      150
    )
  }

  // Group appointments by type for display
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayAppointments = appointments?.filter((a) => a.date === todayStr) ?? []
  const futureAppointments = appointments?.filter((a) => a.date > todayStr) ?? []
  const pastAppointments = appointments?.filter((a) => a.date < todayStr) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Criar Prontuário
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' && 'Selecione o paciente para registrar o prontuário.'}
            {mode === 'with-session' && 'Selecione a sessão para vincular ao prontuário.'}
            {mode === 'without-session' && 'Confirme a criação do prontuário sem sessão.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Patient */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Paciente</label>
            {loadingPatients ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pacientes...
              </div>
            ) : (
              <Select
                value={selectedPatientId ?? ''}
                onValueChange={(v) => {
                  setSelectedPatientId(v || null)
                  setMode('choose')
                }}
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

          {/* Step 2: Choose mode (only shows when patient is selected) */}
          {selectedPatientId && mode === 'choose' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Vincular a uma sessão?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('with-session')}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-surface hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer text-center"
                >
                  <Link2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">Sim, vincular</span>
                  <span className="text-xs text-muted-foreground">
                    Sessão de hoje, futura ou passada
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateStandalone}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-surface hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer text-center"
                >
                  <FileEdit className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">Não, criar avulso</span>
                  <span className="text-xs text-muted-foreground">Vincular depois se quiser</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Session list (when linking to session) */}
          {selectedPatientId && mode === 'with-session' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">Sessões disponíveis</label>
                <button
                  type="button"
                  onClick={() => setMode('choose')}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Voltar
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
                    Nenhuma sessão disponível sem prontuário.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Todas as sessões já possuem prontuário.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {/* Today's sessions */}
                  {todayAppointments.length > 0 && (
                    <SessionGroup
                      label="Hoje"
                      appointments={todayAppointments}
                      onSelect={handleSelectAppointment}
                    />
                  )}

                  {/* Future sessions */}
                  {futureAppointments.length > 0 && (
                    <SessionGroup
                      label="Futuras"
                      appointments={futureAppointments}
                      onSelect={handleSelectAppointment}
                    />
                  )}

                  {/* Past sessions */}
                  {pastAppointments.length > 0 && (
                    <SessionGroup
                      label="Passadas"
                      appointments={pastAppointments}
                      onSelect={handleSelectAppointment}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SessionGroup({
  label,
  appointments,
  onSelect,
}: {
  label: string
  appointments: { id: string; date: string; start_time: string; end_time: string; status: string }[]
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="space-y-1.5">
        {appointments.map((apt) => (
          <button
            key={apt.id}
            type="button"
            onClick={() => onSelect(apt.id)}
            className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{formatDate(apt.date)}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {apt.status === 'completed' ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 text-success border-success/30"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Concluída
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Agendada
                  </Badge>
                )}
                <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  Selecionar
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
