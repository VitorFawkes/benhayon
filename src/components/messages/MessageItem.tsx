import { motion } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Image as ImageIcon,
  Mic,
  MessageSquareText,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import type { MessageLog } from '@/types'

// ─── Types ───

interface MessageItemProps {
  message: MessageLog
  onImageClick?: (url: string) => void
}

// ─── Intent badge config ───

const AI_INTENT_CONFIG: Record<string, { label: string; className: string }> = {
  payment_claimed: {
    label: 'Pagamento alegado',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  question: {
    label: 'Pergunta',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  acknowledgment: {
    label: 'Confirmação',
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  irrelevant: {
    label: 'Irrelevante',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
  },
  receipt_sent: {
    label: 'Comprovante',
    className: 'bg-purple-100 text-purple-700 border-purple-200',
  },
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  document: 'Documento',
}

const MESSAGE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: MessageSquareText,
  image: ImageIcon,
  audio: Mic,
  document: FileText,
}

// ─── Sub-renderers ───

function TextContent({ message }: { message: MessageLog }) {
  const intentConfig = message.ai_intent
    ? AI_INTENT_CONFIG[message.ai_intent]
    : null

  const summary =
    message.ai_analysis && typeof message.ai_analysis === 'object'
      ? (message.ai_analysis as Record<string, unknown>).summary
      : null

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
        {message.content || '(sem conteúdo)'}
      </p>

      {intentConfig && (
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0', intentConfig.className)}
        >
          {intentConfig.label}
        </Badge>
      )}

      {typeof summary === 'string' && summary && (
        <p className="text-xs italic text-muted-foreground">{String(summary)}</p>
      )}
    </div>
  )
}

function ImageContent({
  message,
  onImageClick,
}: {
  message: MessageLog
  onImageClick?: (url: string) => void
}) {
  const isReceipt = message.ai_intent === 'receipt_sent'

  return (
    <div className="space-y-1.5">
      {message.media_url ? (
        <div className="relative inline-block">
          <button
            onClick={() => onImageClick?.(message.media_url!)}
            className="rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity cursor-pointer"
          >
            <img
              src={message.media_url}
              alt="Imagem recebida"
              className="max-w-[200px] max-h-[200px] object-cover"
            />
          </button>
          {isReceipt && (
            <Badge
              variant="outline"
              className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-200"
            >
              <Receipt className="h-3 w-3 mr-0.5" />
              Comprovante
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          <span>Imagem não disponível</span>
        </div>
      )}
    </div>
  )
}

function AudioContent({ message }: { message: MessageLog }) {
  return (
    <div className="space-y-1.5">
      {message.media_url && (
        <audio controls className="w-full max-w-sm" preload="metadata">
          <source src={message.media_url} />
          Seu navegador não suporta o player de áudio.
        </audio>
      )}

      {message.content && (
        <p className="text-xs italic text-muted-foreground">
          {message.content}
        </p>
      )}

      {!message.media_url && !message.content && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Mic className="h-5 w-5" />
          <span>Áudio não disponível</span>
        </div>
      )}
    </div>
  )
}

function DocumentContent({ message }: { message: MessageLog }) {
  if (message.media_url) {
    return (
      <a
        href={message.media_url}
        target="_blank"
        rel="noopener noreferrer"
        download
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
      >
        <FileText className="h-5 w-5 text-muted-foreground" />
        <span>Documento</span>
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      <FileText className="h-5 w-5" />
      <span>Documento não disponível</span>
    </div>
  )
}

// ─── Main Component ───

export default function MessageItem({ message, onImageClick }: MessageItemProps) {
  const isInbound = message.direction === 'inbound'
  const TypeIcon = MESSAGE_TYPE_ICONS[message.message_type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex gap-3 rounded-lg border border-border p-4',
        isInbound
          ? 'border-l-4 border-l-blue-400 bg-surface'
          : 'border-l-4 border-l-green-400 bg-primary/5'
      )}
    >
      {/* Indicador de direção */}
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isInbound ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
        )}
      >
        {isInbound ? (
          <ArrowDownLeft className="h-4 w-4" />
        ) : (
          <ArrowUpRight className="h-4 w-4" />
        )}
      </div>

      {/* Corpo da mensagem */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2 flex-wrap">
          {message.patient?.full_name && (
            <span className="text-sm font-medium text-foreground">
              {message.patient.full_name}
            </span>
          )}

          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {TypeIcon && <TypeIcon className="h-3.5 w-3.5" />}
            {MESSAGE_TYPE_LABELS[message.message_type] || message.message_type}
          </span>

          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            {formatDateTime(message.created_at)}
          </span>
        </div>

        {/* Conteúdo por tipo */}
        {message.message_type === 'text' && <TextContent message={message} />}
        {message.message_type === 'image' && (
          <ImageContent message={message} onImageClick={onImageClick} />
        )}
        {message.message_type === 'audio' && <AudioContent message={message} />}
        {message.message_type === 'document' && (
          <DocumentContent message={message} />
        )}
      </div>
    </motion.div>
  )
}
