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

type ConnectOpts = {
  /** Open floating chat panel (default true). */
  openChat?: boolean
  /** Ask GlobalChatbot to run O/X diagnosis once features are set. */
  diagnose?: boolean
}

type SelectedLotContextValue = {
  selectedLotId: string | null
  selectedFeatures: ChatFeatures | null
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  /** True until GlobalChatbot consumes and runs one diagnosis. */
  diagnoseRequested: boolean
  clearDiagnoseRequest: () => void
  /** Bind Main LOT sensors into chatbot features; optionally open panel + auto-diagnose. */
  connectLot: (record: LotSensorRecord, opts?: ConnectOpts) => void
  clearLot: () => void
}

const SelectedLotContext = createContext<SelectedLotContextValue | null>(null)

export function SelectedLotProvider({ children }: { children: ReactNode }) {
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<ChatFeatures | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [diagnoseRequested, setDiagnoseRequested] = useState(false)

  const connectLot = useCallback((record: LotSensorRecord, opts?: ConnectOpts) => {
    setSelectedLotId(record.id)
    setSelectedFeatures(lotToChatFeatures(record))
    if (opts?.openChat !== false) {
      setChatOpen(true)
    }
    if (opts?.diagnose) {
      setDiagnoseRequested(true)
    }
  }, [])

  const clearDiagnoseRequest = useCallback(() => {
    setDiagnoseRequested(false)
  }, [])

  const clearLot = useCallback(() => {
    setSelectedLotId(null)
    setSelectedFeatures(null)
    setDiagnoseRequested(false)
  }, [])

  const value = useMemo(
    () => ({
      selectedLotId,
      selectedFeatures,
      chatOpen,
      setChatOpen,
      diagnoseRequested,
      clearDiagnoseRequest,
      connectLot,
      clearLot,
    }),
    [
      selectedLotId,
      selectedFeatures,
      chatOpen,
      diagnoseRequested,
      clearDiagnoseRequest,
      connectLot,
      clearLot,
    ],
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
