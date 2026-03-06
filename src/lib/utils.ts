import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Appointment, SessionNoteTarget } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a human-readable message from any error (including Supabase FunctionsHttpError) */
export function extractErrorMessage(error: unknown, fallback = 'Erro desconhecido'): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message) || fallback
  }
  if (typeof error === 'string') return error
  return fallback
}

export function appointmentToTarget(apt: Appointment): SessionNoteTarget {
  return {
    appointmentId: apt.id,
    patientId: apt.patient_id,
    date: apt.date,
    startTime: apt.start_time,
    endTime: apt.end_time,
    status: apt.status,
  }
}
