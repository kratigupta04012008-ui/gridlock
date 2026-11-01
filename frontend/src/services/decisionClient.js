/**
 * GRID LOCK — Decision API Client
 *
 * Communicates with the FastAPI backend.
 * Strict rules:
 * - Exactly ONE request per call (NO retries).
 * - Full client-side validation of response schema & vehicle ID set.
 */

import { validateDecisionIdSet, validateDecisionResponse } from '../contracts/decisionValidation.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export class DecisionClientError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message)
    this.name = 'DecisionClientError'
    this.statusCode = statusCode
    this.details = details
  }
}

/**
 * Fetch decision batch for all active vehicles.
 * @param {object} params
 * @param {number} params.tickId
 * @param {Array<object>} params.telemetry
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ tickId: number, batchSize: number, decisions: Array, providerLatencyMs: number, roundTripLatencyMs: number }>}
 */
export async function fetchDecisions({ tickId, telemetry, signal }) {
  const url = `${API_BASE}/api/decide`
  const expectedIds = telemetry.map((t) => t.id)

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickId, telemetry }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err
    }
    throw new DecisionClientError(
      `Network error connecting to decision server: ${err.message}`,
      502
    )
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const detail = data?.detail || `Server returned HTTP ${res.status}`
    throw new DecisionClientError(detail, res.status, data)
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.decisions)) {
    throw new DecisionClientError('Invalid server response structure: missing decisions array', 502)
  }

  // Client-side schema validation of decisions payload
  const schemaRes = validateDecisionResponse({ decisions: data.decisions })
  if (!schemaRes.valid) {
    throw new DecisionClientError(
      `Decision response failed schema: ${schemaRes.errors?.join('; ')}`,
      502,
      schemaRes.errors
    )
  }

  // Client-side ID set reconciliation
  const idRes = validateDecisionIdSet(data.decisions, expectedIds)
  if (!idRes.valid) {
    throw new DecisionClientError(`Decision response ID mismatch: ${idRes.error}`, 502)
  }

  return data
}

/**
 * Compiles decision prompt without invoking provider.
 */
export async function fetchPreview({ tickId, telemetry, signal }) {
  const url = `${API_BASE}/api/decide/preview`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickId, telemetry }),
    signal,
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new DecisionClientError(data?.detail || `Preview error HTTP ${res.status}`, res.status)
  }
  return data
}

/**
 * Retrieves backend LLM configuration and key status.
 */
export async function fetchConfig(signal) {
  const url = `${API_BASE}/api/llm/config`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new DecisionClientError(`Config error HTTP ${res.status}`, res.status)
  }
  return res.json()
}

/**
 * Retrieves backend call ledger and invariants.
 */
export async function fetchLedger(signal) {
  const url = `${API_BASE}/api/llm/ledger`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new DecisionClientError(`Ledger error HTTP ${res.status}`, res.status)
  }
  return res.json()
}

/**
 * Resets backend simulation state and consumed tick IDs.
 */
export async function resetBackendSession() {
  const url = `${API_BASE}/api/sim/reset`
  try {
    await fetch(url, { method: 'POST' })
  } catch {
    // Ignore if backend offline
  }
}
