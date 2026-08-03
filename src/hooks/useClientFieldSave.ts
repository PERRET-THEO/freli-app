import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addressPatchSchema,
  parseClientScalarField,
  type ClientPatch,
  type ClientRecord,
  type ClientScalarField,
} from '../lib/clientRecord'
import { supabase } from '../lib/supabase'

export type FieldSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type UseClientFieldSaveArgs = {
  clientId: string
  client: ClientRecord
  onClientChange: (next: ClientRecord) => void
}

export function useClientFieldSave({
  clientId,
  client,
  onClientChange,
}: UseClientFieldSaveArgs) {
  const [statuses, setStatuses] = useState<Record<string, FieldSaveStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, number>>({})
  const clientRef = useRef(client)

  useEffect(() => {
    clientRef.current = client
  }, [client])

  const setStatus = (key: string, status: FieldSaveStatus, error?: string) => {
    setStatuses((prev) => ({ ...prev, [key]: status }))
    setErrors((prev) => {
      if (!error) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: error }
    })
  }

  const persistPatch = useCallback(
    async (key: string, patch: ClientPatch, rollback: ClientRecord) => {
      window.clearTimeout(timers.current[key])
      setStatus(key, 'saving')
      const optimistic = { ...clientRef.current, ...patch }
      onClientChange(optimistic)

      const { error } = await supabase
        .from('clients')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', clientId)

      if (error) {
        onClientChange(rollback)
        setStatus(key, 'error', error.message || 'Échec de la sauvegarde')
        return false
      }

      setStatus(key, 'saved')
      window.setTimeout(() => {
        setStatuses((prev) => (prev[key] === 'saved' ? { ...prev, [key]: 'idle' } : prev))
      }, 1600)
      return true
    },
    [clientId, onClientChange],
  )

  const saveField = useCallback(
    async (field: ClientScalarField, raw: string) => {
      window.clearTimeout(timers.current[field])
      const parsed = parseClientScalarField(field, raw)
      if (!parsed.ok) {
        setStatus(field, 'error', parsed.error)
        return false
      }
      const rollback = clientRef.current
      const current = rollback[field]
      if ((current ?? null) === (parsed.value as typeof current)) {
        setStatus(field, 'idle')
        return true
      }
      return persistPatch(field, { [field]: parsed.value } as ClientPatch, rollback)
    },
    [persistPatch],
  )

  const scheduleSaveField = useCallback(
    (field: ClientScalarField, raw: string, debounceMs = 400) => {
      window.clearTimeout(timers.current[field])
      timers.current[field] = window.setTimeout(() => {
        void saveField(field, raw)
      }, debounceMs)
    },
    [saveField],
  )

  const saveAddressPatch = useCallback(
    async (raw: {
      address_street: string
      address_city: string
      address_postal_code: string
      address_country: string
    }) => {
      const parsed = addressPatchSchema.safeParse(raw)
      if (!parsed.success) {
        setStatus('address', 'error', parsed.error.issues[0]?.message ?? 'Adresse invalide')
        return false
      }
      const rollback = clientRef.current
      return persistPatch('address', parsed.data, rollback)
    },
    [persistPatch],
  )

  const savePatch = useCallback(
    async (key: string, patch: ClientPatch) => {
      const rollback = clientRef.current
      return persistPatch(key, patch, rollback)
    },
    [persistPatch],
  )

  const cancelPending = useCallback((key?: string) => {
    if (key) {
      window.clearTimeout(timers.current[key])
      delete timers.current[key]
      return
    }
    for (const timerKey of Object.keys(timers.current)) {
      window.clearTimeout(timers.current[timerKey])
      delete timers.current[timerKey]
    }
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of Object.values(pending)) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return {
    statuses,
    errors,
    saveField,
    scheduleSaveField,
    saveAddressPatch,
    savePatch,
    cancelPending,
  }
}
