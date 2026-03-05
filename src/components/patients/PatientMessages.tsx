import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import MessageItem from '@/components/messages/MessageItem'
import MediaViewer from '@/components/messages/MediaViewer'
import type { MessageLog, MessageType } from '@/types'

interface PatientMessagesProps {
  patientId: string
}

const MESSAGE_TYPE_FILTERS: Array<{ label: string; value: MessageType | null }> = [
  { label: 'Todos', value: null },
  { label: 'Texto', value: 'text' },
  { label: 'Audio', value: 'audio' },
  { label: 'Imagem', value: 'image' },
  { label: 'Documento', value: 'document' },
]

export default function PatientMessages({ patientId }: PatientMessagesProps) {
  const [typeFilter, setTypeFilter] = useState<MessageType | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

  const { data: messages, isLoading } = useQuery({
    queryKey: ['patient-messages', patientId, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('message_logs')
        .select('*, patient:patients(id, full_name, phone)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (typeFilter) {
        query = query.eq('message_type', typeFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data as MessageLog[]
    },
    enabled: !!patientId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-md" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const items = messages ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {MESSAGE_TYPE_FILTERS.map((filter) => (
          <Button
            key={filter.label}
            variant={typeFilter === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTypeFilter(filter.value)}
            className={cn(
              typeFilter === filter.value
                ? ''
                : 'text-muted-foreground'
            )}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Messages list */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nenhuma mensagem registrada
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              As mensagens deste paciente aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onImageClick={(url) => setSelectedImageUrl(url)}
            />
          ))}
        </div>
      )}

      {/* Media viewer modal */}
      <MediaViewer
        open={!!selectedImageUrl}
        onOpenChange={(open) => {
          if (!open) setSelectedImageUrl(null)
        }}
        imageUrl={selectedImageUrl}
      />
    </motion.div>
  )
}
