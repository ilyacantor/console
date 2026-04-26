/**
 * Identity loader — shared cached fetch of /api/auth/identity.
 *
 * Returns the single-operator dev identity (tenant_id + operator_id) per
 * deferred entry #9. Cached as a one-shot promise so concurrent callers
 * share the same fetch.
 */

import { useEffect, useState } from 'react'

export interface Identity {
  tenant_id: string
  operator_id: string
}

let _identityPromise: Promise<Identity> | null = null

export function loadIdentity(): Promise<Identity> {
  if (_identityPromise) return _identityPromise
  _identityPromise = fetch('/api/auth/identity')
    .then(async (r) => {
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText)
        throw new Error(
          `Identity load failed — /api/auth/identity returned ${r.status}: ${text}`,
        )
      }
      return r.json() as Promise<Identity>
    })
    .catch((err) => {
      _identityPromise = null
      throw err
    })
  return _identityPromise
}

export function useIdentity(): { identity: Identity | null; error: string | null } {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadIdentity()
      .then(setIdentity)
      .catch((err: Error) => setError(err.message))
  }, [])

  return { identity, error }
}
