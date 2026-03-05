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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  useSessionNote,
  useUpsertSessionNote,
  usePreviousSessionNote,
} from '@/hooks/useSessionNotes'
import { useUpdateAppointment } from '@/hooks/useAppointments'
import { formatDate, formatTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

export default function SessionNoteDialog({ open, onOpenChange, target }: SessionNoteDialogProps) {
  const navigate = useNavigate()
  const { data: note, isLoading } = useSessionNote(open ? target?.appointmentId : undefined)
  const { data: previousNote } = usePreviousSessionNote(
    open ? target?.patientId : undefined,
    open ? target?.date : undefined
  )
  const upsertNote = useUpsertSessionNote()
  const updateAppointment = useUpdateAppointment()

  const [content, setContent] = useState('')
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [audioPlayUrl, setAudioPlayUrl] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [previousExpanded, setPreviousExpanded] = useState(true)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const contentRef = useRef(content)
  contentRef.current = content

  // ─── Load existing note + localStorage draft recovery ───
  useEffect(() => {
    if (note) {
      setContent(note.content ?? '')
      setAudioPath(note.audio_url)
      setTranscription(note.transcription)

      if (note.audio_url) {
        getSignedAudioUrl(note.audio_url).then(setAudioPlayUrl)
      } else {
        setAudioPlayUrl(null)
      }
      // Clear draft since DB has data
      if (target?.appointmentId) {
        localStorage.removeItem(DRAFT_PREFIX + target.appointmentId)
      }
    } else if (target?.appointmentId) {
      // No note in DB — try localStorage draft
      const draft = localStorage.getItem(DRAFT_PREFIX + target.appointmentId)
      setContent(draft ?? '')
      setAudioPath(null)
      setAudioPlayUrl(null)
      setTranscription(null)
    } else {
      setContent('')
      setAudioPath(null)
      setAudioPlayUrl(null)
      setTranscription(null)
    }
  }, [note, target?.appointmentId])

  // ─── Flush pending save + cleanup when dialog closes ───
  useEffect(() => {
    if (!open && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      // Flush pending content to DB so nothing is lost
      saveContent(contentRef.current)
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
  // upsertNote.mutate is stable in TanStack Query v5, safe to omit from deps
  const saveContent = useCallback(
    (text: string) => {
      if (!target) return
      upsertNote.mutate(
        {
          appointmentId: target.appointmentId,
          patientId: target.patientId,
          content: text || null,
          audioUrl: audioPath,
          transcription,
        },
        {
          onSuccess: () => {
            localStorage.removeItem(DRAFT_PREFIX + target.appointmentId)
          },
        }
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, audioPath, transcription]
  )

  const handleContentChange = (text: string) => {
    setContent(text)
    // Save draft to localStorage immediately
    if (target?.appointmentId) {
      localStorage.setItem(DRAFT_PREFIX + target.appointmentId, text)
    }
    // Debounced auto-save to DB
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
    } catch {
      toast.error('Não foi possível acessar o microfone')
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
      const fileName = `${target.appointmentId}_${Date.now()}.webm`
      const path = `${target.patientId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('session-audio')
        .upload(path, blob, { contentType: 'audio/webm' })

      if (uploadError) throw uploadError

      const signedUrl = await getSignedAudioUrl(path)
      if (!signedUrl) throw new Error('Failed to get signed URL')

      setAudioPath(path)
      setAudioPlayUrl(signedUrl)

      upsertNote.mutate({
        appointmentId: target.appointmentId,
        patientId: target.patientId,
        content: contentRef.current || null,
        audioUrl: path,
        transcription,
      })

      toast.success('Áudio salvo com sucesso')
      await transcribeAudio(path, signedUrl)
    } catch {
      toast.error('Erro ao fazer upload do áudio')
    } finally {
      setIsUploading(false)
    }
  }

  const transcribeAudio = async (path: string, signedUrl: string) => {
    if (!target) return

    setIsTranscribing(true)
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio_url: signedUrl },
      })

      if (error) throw error

      const text = data?.transcription ?? ''
      setTranscription(text)

      upsertNote.mutate({
        appointmentId: target.appointmentId,
        patientId: target.patientId,
        content: contentRef.current || null,
        audioUrl: path,
        transcription: text,
      })

      toast.success('Áudio transcrito com sucesso')
    } catch {
      toast.error('Erro ao transcrever áudio (a edge function pode não estar configurada)')
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
            Prontuário da Sessão
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>
              {formatDate(target.date)} — {formatTime(target.startTime)} a{' '}
              {formatTime(target.endTime)}
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
                  Sessão anterior — {formatDate(previousNote.appointment?.date ?? previousNote.created_at)}
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
              {/* Save status */}
              <div className="flex items-center gap-1.5 text-xs mt-1 h-4">
                {upsertNote.isPending ? (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Salvando...
                  </span>
                ) : note ? (
                  <span className="text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Salvo
                  </span>
                ) : null}
              </div>
            </div>

            {/* Audio recording */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Áudio
              </label>
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

            {/* Complete session action */}
            {target.status === 'scheduled' && (
              <div className="pt-3 border-t border-border">
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    if (saveTimerRef.current) {
                      clearTimeout(saveTimerRef.current)
                      saveContent(content)
                    }
                    updateAppointment.mutate(
                      { id: target.appointmentId, status: 'completed' },
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

            {target.status === 'completed' && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm text-success justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                  Sessão concluída
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
