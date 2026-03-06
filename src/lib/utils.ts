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

/** Throw a descriptive error from supabase.functions.invoke result */
export async function throwIfFunctionsError(error: unknown): Promise<void> {
  if (!error) return
  // FunctionsHttpError carries response body in context
  let detail = ''
  try {
    if (typeof error === 'object' && error !== null && 'context' in error) {
      const ctx = (error as any).context
      if (ctx?.body) {
        const body = await new Response(ctx.body).json()
        detail = body?.detail || body?.error || ''
      }
    }
  } catch { /* ignore parse errors */ }
  throw new Error(detail || extractErrorMessage(error))
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
