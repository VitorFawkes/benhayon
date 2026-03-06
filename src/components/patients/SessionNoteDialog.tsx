import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  FileText,
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  History,
  ChevronDown,
  ExternalLink,
  Link2,
  Calendar,
  Clock,
  Save,
} from 'lucide-react'
import { supabase, invokeEdgeFunction } from '@/lib/supabase'
import {
  useSessionNote,
  useSessionNoteById,
  useUpsertSessionNote,
  usePreviousSessionNote,
  useLinkNoteToAppointment,
} from '@/hooks/useSessionNotes'
import { useAvailableForNotes, useUpdateAppointment } from '@/hooks/useAppointments'
import { formatDate, formatTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { SessionNoteTarget } from '@/types'

interface SessionNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: SessionNoteTarget | null
}

const DRAFT_PREFIX = 'draft-note-'

/** Generate a signed URL from a storage path (1h expiry) */
async function getSignedAudioUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('session-audio')
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

function formatRecordingTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/** Draft key: prefer appointmentId, fall back to noteId, then patientId */
function getDraftKey(target: SessionNoteTarget | null): string | null {
  if (!target) return null
  return target.appointmentId ?? target.noteId ?? `standalone-${target.patientId}`
}

export default function SessionNoteDialog({ open, onOpenChange, target }: SessionNoteDialogProps) {
  const navigate = useNavigate()
  const isStandalone = !target?.appointmentId

  // Load note by appointment_id (normal) or by noteId (standalone/edit)
  const { data: noteByAppointment, isLoading: loadingByApt } = useSessionNote(
    open && target?.appointmentId ? target.appointmentId : undefined
  )
  const { data: noteById, isLoading: loadingById } = useSessionNoteById(
    open && !target?.appointmentId && target?.noteId ? target.noteId : undefined
  )

  const note = noteByAppointment ?? noteById
  const isLoading = loadingByApt || loadingById

  const { data: previousNote } = usePreviousSessionNote(
    open ? target?.patientId : undefined,
    open && target?.date ? target.date : undefined
  )
  const upsertNote = useUpsertSessionNote()
  const updateAppointment = useUpdateAppointment()
  const linkNote = useLinkNoteToAppointment()

  const [content, setContent] = useState('')
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [audioPlayUrl, setAudioPlayUrl] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [previousExpanded, setPreviousExpanded] = useState(true)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const contentRef = useRef(content)
  contentRef.current = content

  const draftKey = getDraftKey(target)

  // ─── Load existing note + localStorage draft recovery ───
  useEffect(() => {
    if (note) {
      setContent(note.content ?? '')
      setAudioPath(note.audio_url)
      setTranscription(note.transcription)
      setCurrentNoteId(note.id)

      if (note.audio_url) {
        getSignedAudioUrl(note.audio_url).then(setAudioPlayUrl)
      } else {
        setAudioPlayUrl(null)
      }
      // Clear draft since DB has data
      if (draftKey) {
        localStorage.removeItem(DRAFT_PREFIX + draftKey)
      }
    } else if (draftKey) {
      // No note in DB — try localStorage draft
      const draft = localStorage.getItem(DRAFT_PREFIX + draftKey)
      setContent(draft ?? '')
      setAudioPath(null)
      setAudioPlayUrl(null)
      setTranscription(null)
      setCurrentNoteId(null)
    } else {
      setContent('')
      setAudioPath(null)
      setAudioPlayUrl(null)
      setTranscription(null)
      setCurrentNoteId(null)
    }
  }, [note, draftKey])

  // ─── Flush pending save + cleanup when dialog closes ───
  useEffect(() => {
    if (!open && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      saveContent(contentRef.current)
    }
    if (!open) {
      setShowLinkPanel(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ─── Recording timer ───
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      setRecordingSeconds(0)
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [isRecording])

  // ─── Save logic ───
  const saveContent = useCallback(
    (text: string) => {
      if (!target) return
      upsertNote.mutate(
        {
          noteId: currentNoteId ?? undefined,
          appointmentId: target.appointmentId,
          patientId: target.patientId,
          content: text || null,
          audioUrl: audioPath,
          transcription,
        },
        {
          onSuccess: (data) => {
            if (draftKey) localStorage.removeItem(DRAFT_PREFIX + draftKey)
            if (!currentNoteId && data?.id) setCurrentNoteId(data.id)
          },
        }
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, audioPath, transcription, currentNoteId, draftKey]
  )

  const handleContentChange = (text: string) => {
    setContent(text)
    if (draftKey) {
      localStorage.setItem(DRAFT_PREFIX + draftKey, text)
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveContent(text), 1500)
  }

  const handleBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveContent(content)
  }

  // ─── Keyboard shortcut: Ctrl+S to force save ───
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveContent(contentRef.current)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, saveContent])

  // ─── Audio recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await uploadAudio(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      toast.error('Não foi possível acessar o microfone', {
        description: error instanceof Error ? error.message : 'Verifique as permissões do navegador',
      })
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const uploadAudio = async (blob: Blob) => {
    if (!target) return

    setIsUploading(true)
    try {
      const fileId = target.appointmentId ?? currentNoteId ?? Date.now().toString()
      const fileName = `${fileId}_${Date.now()}.webm`
      const path = `${target.patientId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('session-audio')
        .upload(path, blob, { contentType: 'audio/webm' })

      if (uploadError) throw uploadError

      const signedUrl = await getSignedAudioUrl(path)
      if (!signedUrl) throw new Error('Failed to get signed URL')

      setAudioPath(path)
      setAudioPlayUrl(signedUrl)

      upsertNote.mutate(
        {
          noteId: currentNoteId ?? undefined,
          appointmentId: target.appointmentId,
          patientId: target.patientId,
          content: contentRef.current || null,
          audioUrl: path,
          transcription,
        },
        {
          onSuccess: (data) => {
            if (!currentNoteId && data?.id) setCurrentNoteId(data.id)
          },
        }
      )

      toast.success('Áudio salvo com sucesso')
      await transcribeAudio(path, signedUrl)
    } catch (error) {
      toast.error('Erro ao fazer upload do áudio', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const transcribeAudio = async (path: string, signedUrl: string) => {
    if (!target) return

    setIsTranscribing(true)
    try {
      const { data, error } = await invokeEdgeFunction('transcribe-audio', {
        audio_url: signedUrl,
      })

      if (error) throw new Error(error instanceof Error ? error.message : String(error))

      const text = data?.transcription ?? ''
      setTranscription(text)

      upsertNote.mutate({
        noteId: currentNoteId ?? undefined,
        appointmentId: target.appointmentId,
        patientId: target.patientId,
        content: contentRef.current || null,
        audioUrl: path,
        transcription: text,
      })

      toast.success('Áudio transcrito com sucesso')
    } catch (error) {
      toast.error('Erro ao transcrever áudio', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setIsTranscribing(false)
    }
  }

  if (!target) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {isStandalone ? 'Prontuário Avulso' : 'Prontuário da Sessão'}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>
              {isStandalone ? (
                <>
                  {target.patientName ?? 'Paciente'} — Sem sessão vinculada
                </>
              ) : (
                <>
                  {formatDate(target.date!)} — {formatTime(target.startTime!)} a{' '}
                  {formatTime(target.endTime!)}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                navigate(`/patients/${target.patientId}`)
              }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver paciente <ExternalLink className="h-3 w-3" />
            </button>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Previous session context */}
            {previousNote && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <button
                  type="button"
                  onClick={() => setPreviousExpanded(!previousExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-primary w-full text-left"
                >
                  <History className="h-4 w-4 shrink-0" />
                  Sessão anterior —{' '}
                  {formatDate(previousNote.appointment?.date ?? previousNote.created_at)}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 ml-auto transition-transform shrink-0',
                      previousExpanded && 'rotate-180'
                    )}
                  />
                </button>
                {previousExpanded && (
                  <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap line-clamp-6">
                    {previousNote.content || previousNote.transcription || 'Sem anotações'}
                  </p>
                )}
              </div>
            )}

            {/* Text notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Notas clínicas
              </label>
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onBlur={handleBlur}
                rows={12}
                placeholder="Escreva suas anotações da sessão..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
              {/* Save button + status */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1.5 text-xs h-4">
                  {upsertNote.isPending ? (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Salvando...
                    </span>
                  ) : note || currentNoteId ? (
                    <span className="text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Salvo
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={upsertNote.isPending || (!content && !audioPath)}
                  onClick={() => {
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
                    saveContent(content)
                  }}
                >
                  {upsertNote.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </div>

            {/* Audio recording */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Áudio</label>
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <Button variant="destructive" size="sm" onClick={stopRecording}>
                    <Square className="h-4 w-4" />
                    Parar gravação
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startRecording}
                    disabled={isUploading}
                  >
                    <Mic className="h-4 w-4" />
                    Gravar áudio
                  </Button>
                )}
                {isRecording && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-mono text-destructive font-medium">
                      {formatRecordingTime(recordingSeconds)}
                    </span>
                  </div>
                )}
                {isUploading && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Enviando...
                  </span>
                )}
              </div>

              {/* Audio player */}
              {audioPlayUrl && (
                <div className="mt-3">
                  <audio controls src={audioPlayUrl} className="w-full h-10" />
                </div>
              )}
            </div>

            {/* Transcription */}
            {(transcription || isTranscribing) && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Transcrição
                </label>
                {isTranscribing ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcrevendo áudio...
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-foreground whitespace-pre-wrap">
                    {transcription}
                  </div>
                )}
              </div>
            )}

            {/* Complete session action (only when linked to a scheduled appointment) */}
            {!isStandalone && target.status === 'scheduled' && (
              <div className="pt-3 border-t border-border">
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    if (saveTimerRef.current) {
                      clearTimeout(saveTimerRef.current)
                      saveContent(content)
                    }
                    updateAppointment.mutate(
                      { id: target.appointmentId!, status: 'completed' },
                      {
                        onSuccess: () => {
                          toast.success('Sessão concluída')
                          onOpenChange(false)
                        },
                        onError: () => toast.error('Erro ao concluir sessão'),
                      }
                    )
                  }}
                  disabled={updateAppointment.isPending || isUploading || isRecording}
                >
                  {updateAppointment.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Concluir Sessão
                </Button>
              </div>
            )}

            {!isStandalone && target.status === 'completed' && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm text-success justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                  Sessão concluída
                </div>
              </div>
            )}

            {/* Link to session (only for standalone notes) */}
            {isStandalone && (
              <div className="pt-3 border-t border-border">
                {!showLinkPanel ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setShowLinkPanel(true)}
                    disabled={!currentNoteId}
                  >
                    <Link2 className="h-4 w-4" />
                    Vincular a uma sessão
                  </Button>
                ) : (
                  <LinkToSessionPanel
                    patientId={target.patientId}
                    noteId={currentNoteId!}
                    onLink={(appointmentId) => {
                      linkNote.mutate(
                        { noteId: currentNoteId!, appointmentId },
                        {
                          onSuccess: () => {
                            toast.success('Prontuário vinculado à sessão')
                            onOpenChange(false)
                          },
                        }
                      )
                    }}
                    onCancel={() => setShowLinkPanel(false)}
                    isLinking={linkNote.isPending}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LinkToSessionPanel({
  patientId,
  onLink,
  onCancel,
  isLinking,
}: {
  patientId: string
  noteId: string
  onLink: (appointmentId: string) => void
  onCancel: () => void
  isLinking: boolean
}) {
  const { data: appointments, isLoading } = useAvailableForNotes(patientId)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Selecione a sessão</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-primary hover:underline"
        >
          Cancelar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando sessões...
        </div>
      ) : !appointments || appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">
          Nenhuma sessão disponível.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {appointments.map((apt) => (
            <button
              key={apt.id}
              type="button"
              onClick={() => onLink(apt.id)}
              disabled={isLinking}
              className="w-full text-left p-2.5 rounded-lg border border-border bg-surface hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground">
                  {formatDate(apt.date)}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                </span>
                {apt.status === 'completed' ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 text-success border-success/30 ml-auto"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Concluída
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    Agendada
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
