import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useUnreadAlertCount, useAlertsRealtime } from '@/hooks/useAlerts'
import { cn } from '@/lib/utils'
import AlertPanel from './AlertPanel'

export default function AlertBell() {
  const [open, setOpen] = useState(false)
  const { data: count = 0 } = useUnreadAlertCount()
  useAlertsRealtime()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        aria-label="Alertas"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 flex items-center justify-center',
            'min-w-[18px] h-[18px] px-1 rounded-full',
            'bg-destructive text-destructive-foreground text-[10px] font-bold',
            'animate-in fade-in zoom-in'
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <AlertPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
