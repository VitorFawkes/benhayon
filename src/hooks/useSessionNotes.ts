import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SessionNote } from '@/types'
import { toast } from 'sonner'

export function useSessionNote(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ['session-note', appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_notes')
        .select('*')
        .eq('appointment_id', appointmentId!)
        .maybeSingle()

      if (error) throw error
      return data as SessionNote | null
    },
    enabled: !!appointmentId,
  })
}

export function useSessionNotesByPatient(patientId: string) {
  return useQuery({
    queryKey: ['session-notes', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_notes')
        .select('appointment_id')
        .eq('patient_id', patientId)

      if (error) throw error
      return new Set((data ?? []).map((n: { appointment_id: string }) => n.appointment_id))
    },
    enabled: !!patientId,
  })
}

export function useUpsertSessionNote() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      appointmentId,
      patientId,
      content,
      audioUrl,
      transcription,
    }: {
      appointmentId: string
      patientId: string
      content?: string | null
      audioUrl?: string | null
      transcription?: string | null
    }) => {
      if (!user) throw new Error('Não autenticado')

      const { data, error } = await supabase
        .from('session_notes')
        .upsert(
          {
            profile_id: user.id,
            appointment_id: appointmentId,
            patient_id: patientId,
            content: content ?? null,
            audio_url: audioUrl ?? null,
            transcription: transcription ?? null,
          },
          { onConflict: 'appointment_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data as SessionNote
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['session-note', data.appointment_id] })
      queryClient.invalidateQueries({ queryKey: ['session-notes'] })
    },
    onError: (error) => {
      toast.error('Erro ao salvar prontuário', { description: error.message })
    },
  })
}
