import { create } from 'zustand'

type ViewMode = 'day' | 'week' | 'month'

interface AgendaState {
  selectedDate: Date
  viewMode: ViewMode
  setSelectedDate: (date: Date) => void
  setViewMode: (mode: ViewMode) => void
}

export const useAgendaStore = create<AgendaState>((set) => ({
  selectedDate: new Date(),
  viewMode: 'week',
  setSelectedDate: (date) => set({ selectedDate: date }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))
