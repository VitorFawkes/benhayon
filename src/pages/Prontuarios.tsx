import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, FileText, Mic, FileType } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useAllSessionNotes } from '@/hooks/useSessionNotes'
import { usePatients } from '@/hooks/usePatients'
import SessionNoteDialog from '@/components/patients/SessionNoteDialog'
import { formatDate, formatTime } from '@/lib/formatters'
import type { SessionNoteTarget, SessionNoteWithDetails } from '@/types'

export default function Prontuarios() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [patientFilter, setPatientFilter] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Note dialog
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [noteTarget, setNoteTarget] = useState<SessionNoteTarget | null>(null)

  // Debounced search
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }, [])

  const { data: notes, isLoading } = useAllSessionNotes({
    search: debouncedSearch || undefined,
    patientId: patientFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const { data: patients } = usePatients()

  function openNote(note: SessionNoteWithDetails) {
    if (!note.appointment) return
    setNoteTarget({
      appointmentId: note.appointment_id,
      patientId: note.patient_id,
      date: note.appointment.date,
      startTime: note.appointment.start_time,
      endTime: note.appointment.end_time,
      status: note.appointment.status,
    })
    setNoteDialogOpen(true)
  }

  const resultCount = notes?.length ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Prontuários</h1>
      </div>

      {/* Search (prominent) */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por conteúdo, transcrição ou paciente..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10 h-11 text-base"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Patient select */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Paciente:</span>
          <Select
            value={patientFilter ?? 'all'}
            onValueChange={(v) => setPatientFilter(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {patients?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">De:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-input bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <span className="text-sm text-muted-foreground">até:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-input bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <span className="ml-auto text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? 'prontuário' : 'prontuários'}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && resultCount === 0 && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-foreground mb-1">
            Nenhum prontuário encontrado
          </p>
          <p className="text-sm text-muted-foreground">
            {debouncedSearch || patientFilter
              ? 'Tente ajustar os filtros.'
              : 'Os prontuários aparecerão aqui conforme você registrar notas nas sessões.'}
          </p>
        </div>
      )}

      {/* Note cards */}
      {!isLoading && resultCount > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {notes!.map((note, index) => {
            const excerpt = (note.content || note.transcription || '').slice(0, 200)

            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
              >
                <Card
                  className="transition-all hover:shadow-md cursor-pointer"
                  onClick={() => openNote(note)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {note.patient?.full_name ?? 'Paciente'}
                          </h3>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDate(note.appointment?.date ?? note.created_at)}
                            {note.appointment && ` — ${formatTime(note.appointment.start_time)}`}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {excerpt || 'Sem conteúdo de texto'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {note.audio_url && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Mic className="h-3 w-3" /> Áudio
                          </Badge>
                        )}
                        {note.transcription && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <FileType className="h-3 w-3" /> Transcrição
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <SessionNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        target={noteTarget}
      />
    </motion.div>
  )
}
