import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  FileText,
  Mic,
  FileType,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { usePatientTimeline } from '@/hooks/useSessionNotes'
import SessionNoteDialog from '@/components/patients/SessionNoteDialog'
import { formatDate, formatTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { SessionNoteTarget, SessionNoteWithDetails } from '@/types'

interface PatientProntuarioProps {
  patientId: string
}

export default function PatientProntuario({ patientId }: PatientProntuarioProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [noteTarget, setNoteTarget] = useState<SessionNoteTarget | null>(null)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }, [])

  const { data: notes, isLoading } = usePatientTimeline(patientId, debouncedSearch || undefined)

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar nas anotações deste paciente..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Counter */}
      <p className="text-sm text-muted-foreground">
        {notes?.length ?? 0} {(notes?.length ?? 0) === 1 ? 'registro' : 'registros'}
      </p>

      {/* Empty state */}
      {(!notes || notes.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              {debouncedSearch ? 'Nenhum resultado encontrado' : 'Nenhum prontuário registrado'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {debouncedSearch
                ? 'Tente buscar por outro termo.'
                : 'As anotações das sessões aparecerão aqui.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {notes && notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note.id
            const displayText = note.content || note.transcription || ''

            return (
              <Card key={note.id} className="transition-all">
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(note.appointment?.date ?? note.created_at)}
                      </span>
                      {note.appointment && (
                        <span className="text-xs text-muted-foreground">
                          {formatTime(note.appointment.start_time)} - {formatTime(note.appointment.end_time)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
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

                  {/* Content */}
                  <p
                    className={cn(
                      'text-sm text-foreground/80 whitespace-pre-wrap',
                      !isExpanded && 'line-clamp-3'
                    )}
                  >
                    {displayText || 'Sem anotações de texto'}
                  </p>

                  {/* Transcription (when expanded and has both content + transcription) */}
                  {isExpanded && note.content && note.transcription && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Transcrição do áudio
                      </p>
                      <p className="text-sm text-foreground/70 whitespace-pre-wrap">
                        {note.transcription}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {displayText.length > 150 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {isExpanded ? 'Recolher' : 'Expandir'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-primary"
                      onClick={() => openNote(note)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
