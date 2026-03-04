import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// ─── Types ───

interface MediaViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string | null
}

// ─── Component ───

export default function MediaViewer({ open, onOpenChange, imageUrl }: MediaViewerProps) {
  if (!imageUrl) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-auto p-2 gap-2">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar imagem</DialogTitle>
          <DialogDescription>Visualização em tela cheia da imagem</DialogDescription>
        </DialogHeader>

        {/* Imagem */}
        <div className="flex items-center justify-center">
          <img
            src={imageUrl}
            alt="Visualização da imagem"
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
          />
        </div>

        {/* Botão de download */}
        <div className="flex justify-center pt-1 pb-1">
          <Button variant="outline" size="sm" asChild>
            <a href={imageUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1.5" />
              Baixar imagem
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
