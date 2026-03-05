import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SessionNote, SessionNoteWithDetails } from '@/types'
import { toast } from 'sonner'

// ─── Query Key Factory ───

const sessionNoteKeys = {
  all: ['session-notes'] as const,
  detail: (appointmentId: string) => ['session-note', appointmentId] as const,
  patient: (patientId: string) => [...sessionNoteKeys.all, 'patient', patientId] as const,
  timeline: (patientId: string, search?: string) => [...sessionNoteKeys.all, 'timeline', patientId, search] as const,
  list: (filters: SessionNoteFilters) => [...sessionNoteKeys.all, 'list', filters] as const,
  previous: (patientId?: string, date?: string) => ['session-note-previous', patientId, date] as const,
}

// ─── Filter Interface ───

export interface SessionNoteFilters {
  search?: string
  patientId?: string | null
  dateFrom?: string
  dateTo?: string
}

// ─── Existing Hooks ───

export function useSessionNote(appointmentId: string | undefined) {
  return useQuery({
    queryKey: sessionNoteKeys.detail(appointmentId!),
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
    queryKey: sessionNoteKeys.patient(patientId),
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
      queryClient.invalidateQueries({ queryKey: sessionNoteKeys.detail(data.appointment_id) })
      queryClient.invalidateQueries({ queryKey: sessionNoteKeys.all })
      queryClient.invalidateQueries({ queryKey: ['session-note-previous'] })
    },
    onError: (error) => {
      toast.error('Erro ao salvar prontuário', { description: error.message })
    },
  })
}

// ─── New Hooks ───

/** All session notes across patients — for /prontuarios page */
export function useAllSessionNotes(filters: SessionNoteFilters = {}) {
  return useQuery({
    queryKey: sessionNoteKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('session_notes')
        .select('*, patient:patients(id, full_name, phone), appointment:appointments(id, date, start_time, end_time, status)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (filters.patientId) {
        query = query.eq('patient_id', filters.patientId)
      }

      if (filters.search) {
        const term = `%${filters.search}%`
        query = query.or(`content.ilike.${term},transcription.ilike.${term}`)
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59')
      }

      const { data, error } = await query
      if (error) throw error
      return data as SessionNoteWithDetails[]
    },
  })
}

/** Patient timeline — for Prontuário tab in PatientDetail */
export function usePatientTimeline(patientId: string, search?: string) {
  return useQuery({
    queryKey: sessionNoteKeys.timeline(patientId, search),
    queryFn: async () => {
      let query = supabase
        .from('session_notes')
        .select('*, appointment:appointments(id, date, start_time, end_time, status)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (search) {
        const term = `%${search}%`
        query = query.or(`content.ilike.${term},transcription.ilike.${term}`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as SessionNoteWithDetails[]
    },
    enabled: !!patientId,
  })
}

/** Check which appointments (by ID) have notes — lightweight, for Agenda indicators */
export function useNoteExistsByAppointments(appointmentIds: string[]) {
  return useQuery({
    queryKey: [...sessionNoteKeys.all, 'exists', appointmentIds],
    queryFn: async () => {
      if (appointmentIds.length === 0) return new Set<string>()

      const { data, error } = await supabase
        .from('session_notes')
        .select('appointment_id')
        .in('appointment_id', appointmentIds)

      if (error) throw error
      return new Set((data ?? []).map((n: { appointment_id: string }) => n.appointment_id))
    },
    enabled: appointmentIds.length > 0,
  })
}

/** Previous session note — for context in SessionNoteDialog */
export function usePreviousSessionNote(patientId?: string, currentDate?: string) {
  return useQuery({
    queryKey: sessionNoteKeys.previous(patientId, currentDate),
    queryFn: async () => {
      // Fetch recent notes with appointment dates, then filter client-side
      // (PostgREST doesn't support filtering on joined columns directly)
      const { data, error } = await supabase
        .from('session_notes')
        .select('*, appointment:appointments!inner(id, date, start_time, end_time, status)')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      // Find the most recent note whose appointment.date is before currentDate
      const previous = (data as SessionNoteWithDetails[])?.find(
        (n) => n.appointment && n.appointment.date < currentDate!
      )

      return previous ?? null
    },
    enabled: !!patientId && !!currentDate,
  })
}
