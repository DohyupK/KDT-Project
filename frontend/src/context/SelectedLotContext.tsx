'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ChatFeatures } from '@/api/aiApi'
import { lotToChatFeatures, type LotSensorRecord } from '@/lib/lotToChatFeatures'

type SelectedLotContextValue = {
  selectedLotId: string | null
  selectedFeatures: ChatFeatures | null
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  /** Bind Main LOT sensors into chatbot features; optionally open the panel. */
  connectLot: (record: LotSensorRecord, opts?: { openChat?: boolean }) => void
  clearLot: () => void
}

const SelectedLotContext = createContext<SelectedLotContextValue | null>(null)

export function SelectedLotProvider({ children }: { children: ReactNode }) {
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<ChatFeatures | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const connectLot = useCallback((record: LotSensorRecord, opts?: { openChat?: boolean }) => {
    setSelectedLotId(record.id)
    setSelectedFeatures(lotToChatFeatures(record))
    if (opts?.openChat !== false) {
      setChatOpen(true)
    }
  }, [])

  const clearLot = useCallback(() => {
    setSelectedLotId(null)
    setSelectedFeatures(null)
  }, [])

  const value = useMemo(
    () => ({
      selectedLotId,
      selectedFeatures,
      chatOpen,
      setChatOpen,
      connectLot,
      clearLot,
    }),
    [selectedLotId, selectedFeatures, chatOpen, connectLot, clearLot],
  )

  return <SelectedLotContext.Provider value={value}>{children}</SelectedLotContext.Provider>
}

export function useSelectedLot(): SelectedLotContextValue {
  const ctx = useContext(SelectedLotContext)
  if (!ctx) {
    throw new Error('useSelectedLot must be used within SelectedLotProvider')
  }
  return ctx
}
