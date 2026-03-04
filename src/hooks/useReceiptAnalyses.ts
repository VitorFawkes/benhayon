import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { ReceiptAnalysis, ReceiptStatus, PaymentMethodType } from '@/types'

// ─── Filter Types ───

export interface ReceiptFilters {
  status?: ReceiptStatus
  patientId?: string
}

// ─── Query Keys ───

const receiptKeys = {
  all: ['receipt-analyses'] as const,
  lists: () => [...receiptKeys.all, 'list'] as const,
  list: (filters?: ReceiptFilters) => [...receiptKeys.lists(), filters] as const,
  details: () => [...receiptKeys.all, 'detail'] as const,
  detail: (id: string) => [...receiptKeys.details(), id] as const,
}

// ─── Select com joins ───

const RECEIPT_SELECT = `
  *,
  patient:patients(id, full_name, phone),
  message_log:message_logs(id, media_url, content),
  invoice:invoices(id, reference_month, total_amount)
`

// ─── Hooks ───

export function useReceiptAnalyses(filters?: ReceiptFilters) {
  const { user } = useAuth()

  return useQuery({
    queryKey: receiptKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('receipt_analyses')
        .select(RECEIPT_SELECT)
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId)
      }

      const { data, error } = await query

      if (error) throw error
      return data as ReceiptAnalysis[]
    },
    enabled: !!user,
  })
}

export function useReceiptAnalysis(id?: string) {
  return useQuery({
    queryKey: receiptKeys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_analyses')
        .select(RECEIPT_SELECT)
        .eq('id', id!)
        .single()

      if (error) throw error
      return data as ReceiptAnalysis
    },
    enabled: !!id,
  })
}

export function useConfirmReceipt() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (receipt: ReceiptAnalysis) => {
      if (!user) throw new Error('Usuário não autenticado')

      // Atualizar status do comprovante para confirmado
      const { error: updateError } = await supabase
        .from('receipt_analyses')
        .update({
          status: 'confirmed' as ReceiptStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', receipt.id)

      if (updateError) throw updateError

      // Criar registro de pagamento com os dados extraídos
      if (receipt.extracted_amount) {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            profile_id: user.id,
            patient_id: receipt.patient_id,
            invoice_id: receipt.matched_invoice_id || null,
            amount: receipt.extracted_amount,
            payment_date: receipt.extracted_date || new Date().toISOString().split('T')[0],
            payment_method: mapExtractedMethod(receipt.extracted_method),
            receipt_url: receipt.media_url,
            receipt_verified: true,
            source: 'receipt_confirmed',
          })

        if (paymentError) throw paymentError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.all })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

export function useRejectReceipt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (receipt: ReceiptAnalysis) => {
      const { error } = await supabase
        .from('receipt_analyses')
        .update({
          status: 'rejected' as ReceiptStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', receipt.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.all })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

// ─── Helpers ───

function mapExtractedMethod(method: string | null): PaymentMethodType {
  if (!method) return 'other'

  const lower = method.toLowerCase()

  if (lower.includes('pix')) return 'pix'
  if (lower.includes('ted') || lower.includes('doc') || lower.includes('transfer')) return 'transfer'
  if (lower.includes('cartão') || lower.includes('cartao') || lower.includes('card') || lower.includes('crédito') || lower.includes('débito')) return 'card'
  if (lower.includes('dinheiro') || lower.includes('cash') || lower.includes('espécie')) return 'cash'

  return 'other'
}
