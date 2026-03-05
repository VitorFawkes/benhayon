import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

// ─── Constants ───

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (WhatsApp media limit)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo "${file.name}" excede 10MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Tipo de arquivo não suportado: ${file.type}. Use JPEG, PNG, WebP ou PDF.`
  }
  return null
}

function getFileType(file: File): 'image' | 'pdf' {
  return file.type === 'application/pdf' ? 'pdf' : 'image'
}

/** Extract storage path from a public URL */
function extractStoragePath(url: string): string | null {
  const match = url.match(/\/notas-fiscais\/(.+)$/)
  return match ? match[1] : null
}

// ─── Upload single nota fiscal ───

export interface UploadNotaFiscalInput {
  file: File
  invoiceId: string
  patientId: string
  existingUrl?: string | null
}

export function useUploadNotaFiscal() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: UploadNotaFiscalInput) => {
      if (!user) throw new Error('Usuário não autenticado')

      const validationError = validateFile(input.file)
      if (validationError) throw new Error(validationError)

      // Remove old file if re-uploading
      if (input.existingUrl) {
        const oldPath = extractStoragePath(input.existingUrl)
        if (oldPath) {
          await supabase.storage.from('notas-fiscais').remove([oldPath])
        }
      }

      // Upload new file
      const timestamp = Date.now()
      const safeFilename = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${input.patientId}/${timestamp}_${safeFilename}`

      const { error: uploadError } = await supabase.storage
        .from('notas-fiscais')
        .upload(path, input.file)

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('notas-fiscais')
        .getPublicUrl(path)

      // Update invoice
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          nota_fiscal_url: publicUrlData.publicUrl,
          nota_fiscal_type: getFileType(input.file),
          nota_fiscal_name: input.file.name,
          nota_fiscal_uploaded_at: new Date().toISOString(),
        })
        .eq('id', input.invoiceId)

      if (updateError) throw updateError

      return { url: publicUrlData.publicUrl }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// ─── Bulk upload notas fiscais ───

export interface BulkUploadItem {
  file: File
  invoiceId: string
  patientId: string
  existingUrl?: string | null
}

export function useBulkUploadNotasFiscais() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (items: BulkUploadItem[]) => {
      if (!user) throw new Error('Usuário não autenticado')

      // Validate all files first
      for (const item of items) {
        const validationError = validateFile(item.file)
        if (validationError) throw new Error(validationError)
      }

      let successCount = 0
      const errors: string[] = []

      for (const item of items) {
        try {
          // Remove old file if exists
          if (item.existingUrl) {
            const oldPath = extractStoragePath(item.existingUrl)
            if (oldPath) {
              await supabase.storage.from('notas-fiscais').remove([oldPath])
            }
          }

          const timestamp = Date.now()
          const safeFilename = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `${user.id}/${item.patientId}/${timestamp}_${safeFilename}`

          const { error: uploadError } = await supabase.storage
            .from('notas-fiscais')
            .upload(path, item.file)

          if (uploadError) throw uploadError

          const { data: publicUrlData } = supabase.storage
            .from('notas-fiscais')
            .getPublicUrl(path)

          const { error: updateError } = await supabase
            .from('invoices')
            .update({
              nota_fiscal_url: publicUrlData.publicUrl,
              nota_fiscal_type: getFileType(item.file),
              nota_fiscal_name: item.file.name,
              nota_fiscal_uploaded_at: new Date().toISOString(),
            })
            .eq('id', item.invoiceId)

          if (updateError) throw updateError

          successCount++
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro desconhecido'
          errors.push(`${item.file.name}: ${msg}`)
        }
      }

      return { successCount, errors, total: items.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      if (result.errors.length > 0) {
        toast.warning(`${result.successCount} de ${result.total} notas enviadas. Erros: ${result.errors.join(', ')}`)
      }
    },
  })
}

// ─── Delete nota fiscal ───

export function useDeleteNotaFiscal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ invoiceId, url }: { invoiceId: string; url: string }) => {
      // Remove file from storage
      const path = extractStoragePath(url)
      if (path) {
        await supabase.storage.from('notas-fiscais').remove([path])
      }

      // Clear invoice columns
      const { error } = await supabase
        .from('invoices')
        .update({
          nota_fiscal_url: null,
          nota_fiscal_type: null,
          nota_fiscal_name: null,
          nota_fiscal_uploaded_at: null,
        })
        .eq('id', invoiceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
