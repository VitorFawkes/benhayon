import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Phone, DollarSign, Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency, formatPhone } from '@/lib/formatters'
import { PATIENT_STATUS_LABELS, PATIENT_STATUS_COLORS } from '@/constants'
import type { Patient } from '@/types'

interface PatientCardProps {
  patient: Patient
  index: number
}

export default function PatientCard({ patient, index }: PatientCardProps) {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className="cursor-pointer transition-shadow hover:shadow-elevated"
        onClick={() => navigate(`/patients/${patient.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground truncate">
                {patient.full_name}
              </h3>

              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{formatPhone(patient.phone)}</span>
              </div>

              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                <span>{formatCurrency(patient.session_value)}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  PATIENT_STATUS_COLORS[patient.status]
                )}
              >
                {PATIENT_STATUS_LABELS[patient.status]}
              </span>

              {patient.payment_type === 'clinic' && patient.clinic?.name && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {patient.clinic.name}
                </span>
              )}

              {patient.payment_type === 'particular' && (
                <Badge variant="outline" className="text-xs">
                  Particular
                </Badge>
              )}

              {patient.ai_enabled === false && (
                <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/50">
                  IA off
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
