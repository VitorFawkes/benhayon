import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Appointment, SessionNoteTarget } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
