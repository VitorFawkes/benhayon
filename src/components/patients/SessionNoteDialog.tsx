import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { FileText, Mic, Square, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSessionNote, useUpsertSessionNote } from '@/hooks/useSessionNotes'
import { useUpdateAppointment } from '@/hooks/useAppointments'
import { formatDate, formatTime } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { Appointment } from '@/types'

interface SessionNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment: Appointment | null
}

/** Generate a signed URL from a storage path (1h expiry) */
async function getSignedAudioUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('session-audio')
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export default function SessionNoteDialog({ open, onOpenChange, appointment }: SessionNoteDialogProps) {
  const { data: note, isLoading } = useSessionNote(open ? appointment?.id : undefined)
  const upsertNote = useUpsertSessionNote()
  const updateAppointment = useUpdateAppointment()

  const [content, setContent] = useState('')
  // audio_url in DB stores the storage PATH (e.g. "patient_id/file.webm"), not a full URL
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [audioPlayUrl, setAudioPlayUrl] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing note — generate signed URL for playback
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
    } else {
      setContent('')
      setAudioPath(null)
      setAudioPlayUrl(null)
      setTranscription(null)
    }
  }, [note])

  const saveContent = useCallback(
    (text: string) => {
      if (!appointment) return
      upsertNote.mutate({
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        content: text || null,
        audioUrl: audioPath,
        transcription,
      })
    },
    [appointment, audioPath, transcription, upsertNote]
  )

  const handleContentChange = (text: string) => {
    setContent(text)
    // Debounced auto-save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveContent(text), 1500)
  }

  const handleBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveContent(content)
  }

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
    if (!appointment) return

    setIsUploading(true)
    try {
      const fileName = `${appointment.id}_${Date.now()}.webm`
      const path = `${appointment.patient_id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('session-audio')
        .upload(path, blob, { contentType: 'audio/webm' })

      if (uploadError) throw uploadError

      // Generate signed URL for immediate playback
      const signedUrl = await getSignedAudioUrl(path)
      if (!signedUrl) throw new Error('Failed to get signed URL')

      setAudioPath(path)
      setAudioPlayUrl(signedUrl)

      // Save storage PATH (not URL) to DB
      upsertNote.mutate({
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        content: content || null,
        audioUrl: path,
        transcription,
      })

      toast.success('Áudio salvo com sucesso')

      // Auto-transcribe — pass the signed URL (valid for 1h, transcription is immediate)
      await transcribeAudio(path, signedUrl)
    } catch {
      toast.error('Erro ao fazer upload do áudio')
    } finally {
      setIsUploading(false)
    }
  }

  const transcribeAudio = async (path: string, signedUrl: string) => {
    if (!appointment) return

    setIsTranscribing(true)
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio_url: signedUrl },
      })

      if (error) throw error

      const text = data?.transcription ?? ''
      setTranscription(text)

      // Save with transcription (path, not URL)
      upsertNote.mutate({
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        content: content || null,
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

  if (!appointment) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Prontuário da Sessão
          </DialogTitle>
          <DialogDescription>
            {formatDate(appointment.date)} — {formatTime(appointment.start_time)} a{' '}
            {formatTime(appointment.end_time)}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Text notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Notas clínicas
              </label>
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onBlur={handleBlur}
                rows={8}
                placeholder="Escreva suas anotações da sessão..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
              {upsertNote.isPending && (
                <p className="text-xs text-muted-foreground mt-1">Salvando...</p>
              )}
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
            {appointment.status === 'scheduled' && (
              <div className="pt-3 border-t border-border">
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    // Save any pending notes first
                    if (saveTimerRef.current) {
                      clearTimeout(saveTimerRef.current)
                      saveContent(content)
                    }
                    updateAppointment.mutate(
                      { id: appointment.id, status: 'completed' },
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

            {appointment.status === 'completed' && (
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
