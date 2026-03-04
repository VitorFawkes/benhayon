import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Payment, PaymentMethodType } from '@/types'

// ─── Filter Types ───

export interface PaymentFilters {
  patient_id?: string | null
  date_from?: string | null
  date_to?: string | null
}

// ─── Query Keys ───

const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: PaymentFilters) => [...paymentKeys.lists(), filters] as const,
}

// ─── Hooks ───

export function usePayments(filters: PaymentFilters = {}) {
  return useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, patient:patients(*), invoice:invoices(*)')
        .order('payment_date', { ascending: false })

      if (filters.patient_id) {
        query = query.eq('patient_id', filters.patient_id)
      }

      if (filters.date_from) {
        query = query.gte('payment_date', filters.date_from)
      }

      if (filters.date_to) {
        query = query.lte('payment_date', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Payment[]
    },
  })
}

export interface CreatePaymentInput {
  patient_id: string
  invoice_id?: string | null
  amount: number
  payment_date: string
  payment_method: PaymentMethodType
  receipt_file?: File | null
  notes?: string | null
}

export function useCreatePayment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreatePaymentInput) => {
      if (!user) throw new Error('Usuário não autenticado')

      let receipt_url: string | null = null

      // Upload do comprovante se fornecido
      if (input.receipt_file) {
        const file = input.receipt_file
        const timestamp = Date.now()
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${user.id}/${input.patient_id}/${timestamp}_${safeFilename}`

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, file)

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(path)

        receipt_url = publicUrlData.publicUrl
      }

      const { data, error } = await supabase
        .from('payments')
        .insert({
          profile_id: user.id,
          patient_id: input.patient_id,
          invoice_id: input.invoice_id || null,
          amount: input.amount,
          payment_date: input.payment_date,
          payment_method: input.payment_method,
          receipt_url,
          receipt_verified: false,
          source: 'manual',
          notes: input.notes || null,
        })
        .select('*, patient:patients(*), invoice:invoices(*)')
        .single()

      if (error) throw error
      return data as Payment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useDeletePayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
