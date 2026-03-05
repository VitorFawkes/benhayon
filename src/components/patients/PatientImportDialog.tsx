import { useState, useRef } from 'react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { Upload, Download, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PatientImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ParsedRow {
  nome_completo: string
  telefone: string
  email: string
  valor_sessao: string
  tipo_pagamento: string
  status: string
  observacoes: string
}

interface ValidatedRow {
  raw: ParsedRow
  errors: string[]
  valid: boolean
}

const PHONE_REGEX = /^\+55\d{10,11}$/
const VALID_STATUSES = ['active', 'inactive', 'paused']
const VALID_PAYMENT_TYPES = ['particular', 'clinic']

function validateRow(row: ParsedRow): ValidatedRow {
  const errors: string[] = []

  if (!row.nome_completo?.trim()) errors.push('Nome obrigatório')
  if (!row.telefone?.trim()) {
    errors.push('Telefone obrigatório')
  } else if (!PHONE_REGEX.test(row.telefone.trim())) {
    errors.push('Telefone inválido (formato: +55XXXXXXXXXXX)')
  }

  const valor = parseFloat(row.valor_sessao)
  if (!row.valor_sessao?.trim() || isNaN(valor) || valor <= 0) {
    errors.push('Valor da sessão inválido')
  }

  if (row.tipo_pagamento && !VALID_PAYMENT_TYPES.includes(row.tipo_pagamento.trim().toLowerCase())) {
    errors.push('Tipo deve ser "particular" ou "clinic"')
  }

  if (row.status && !VALID_STATUSES.includes(row.status.trim().toLowerCase())) {
    errors.push('Status deve ser "active", "inactive" ou "paused"')
  }

  return { raw: row, errors, valid: errors.length === 0 }
}

export default function PatientImportDialog({ open, onOpenChange }: PatientImportDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number } | null>(null)

  const validRows = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validated = results.data.map(validateRow)
        setRows(validated)
        setStep(2)
      },
      error: () => {
        toast.error('Erro ao ler o arquivo CSV')
      },
    })
  }

  async function handleImport() {
    if (!user || validRows.length === 0) return

    setIsImporting(true)
    let imported = 0
    let duplicates = 0
    let errors = 0

    for (const row of validRows) {
      const { raw } = row
      const patient = {
        profile_id: user.id,
        full_name: raw.nome_completo.trim(),
        phone: raw.telefone.trim(),
        email: raw.email?.trim() || null,
        session_value: parseFloat(raw.valor_sessao),
        payment_type: (raw.tipo_pagamento?.trim().toLowerCase() || 'particular') as 'particular' | 'clinic',
        status: (raw.status?.trim().toLowerCase() || 'active') as 'active' | 'inactive' | 'paused',
        notes: raw.observacoes?.trim() || null,
        ai_enabled: true,
      }

      const { error } = await supabase.from('patients').insert(patient)

      if (error) {
        if (error.code === '23505') {
          duplicates++
        } else {
          errors++
        }
      } else {
        imported++
      }
    }

    setResult({ imported, duplicates, errors })
    setStep(3)
    setIsImporting(false)
    queryClient.invalidateQueries({ queryKey: ['patients'] })
  }

  function handleClose() {
    setStep(1)
    setRows([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Pacientes
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Faça upload de um arquivo CSV com os dados dos pacientes.'}
            {step === 2 && 'Revise os dados antes de importar.'}
            {step === 3 && 'Importação concluída.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium mb-1">
                Arraste um arquivo CSV ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Formato: nome_completo, telefone, email, valor_sessao, tipo_pagamento, status, observacoes
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-upload"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Selecionar arquivo
              </Button>
            </div>

            <a
              href="/modelo_importacao_pacientes.csv"
              download
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Download size={14} />
              Baixar modelo de importação
            </a>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="bg-success-light text-success border-0">
                {validRows.length} válida{validRows.length !== 1 ? 's' : ''}
              </Badge>
              {invalidRows.length > 0 && (
                <Badge className="bg-destructive-light text-destructive border-0">
                  {invalidRows.length} com erro{invalidRows.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={row.valid ? '' : 'bg-destructive/5'}>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle2 size={14} className="text-success" />
                        ) : (
                          <AlertCircle size={14} className="text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {row.raw.nome_completo || '—'}
                      </TableCell>
                      <TableCell className="text-sm">{row.raw.telefone || '—'}</TableCell>
                      <TableCell className="text-sm">{row.raw.valor_sessao || '—'}</TableCell>
                      <TableCell className="text-sm">{row.raw.tipo_pagamento || 'particular'}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <span className="text-xs text-destructive">
                            {row.errors.join(', ')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep(1); setRows([]) }}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  `Importar ${validRows.length} paciente${validRows.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {result.imported} paciente{result.imported !== 1 ? 's' : ''} importado{result.imported !== 1 ? 's' : ''}
                </p>
                {result.duplicates > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {result.duplicates} duplicata{result.duplicates !== 1 ? 's' : ''} ignorada{result.duplicates !== 1 ? 's' : ''}
                  </p>
                )}
                {result.errors > 0 && (
                  <p className="text-xs text-destructive">
                    {result.errors} erro{result.errors !== 1 ? 's' : ''} durante a importação
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
