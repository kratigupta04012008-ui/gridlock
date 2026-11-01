/**
 * GRID LOCK — Data Contracts & Validation
 *
 * Invariant: Never allow global spatial coordinates (x, y, etc.) or internal vehicle
 * fields (speed, heading, lane, route, acceleration) in telemetry.
 */

import {
  validateTelemetryReport,
  validateTelemetryBatch,
} from '../telemetry/serializeTelemetryBatch.js'

export const SIGNAL_STATES = Object.freeze(['RED', 'YELLOW', 'GREEN'])
export const ACTION_TYPES = Object.freeze(['ACCELERATE', 'BRAKE', 'MAINTAIN'])

export const FORBIDDEN_TELEMETRY_KEYS = Object.freeze([
  'speed',
  'velocity',
  'acceleration',
  'x',
  'y',
  'posx',
  'posy',
  'position',
  'grid',
  'globalx',
  'globaly',
  'coord',
  'coordinates',
  'lane',
  'laneid',
  'route',
  'movement',
  'approach',
  'heading',
  'occupancy',
  'timestamp',
  'width',
  'length',
])

export function containsForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return false
  const keys = Object.keys(obj).map((k) => k.toLowerCase())
  for (const forbidden of FORBIDDEN_TELEMETRY_KEYS) {
    if (keys.includes(forbidden)) return true
  }
  return false
}

/**
 * Validates a single vehicle's telemetry report against the canonical schema.
 * Reconciled single source of truth.
 */
export function validateCarTelemetry(telemetry) {
  if (!telemetry || typeof telemetry !== 'object') {
    return { valid: false, error: 'Car telemetry must be an object' }
  }
  if (containsForbiddenKeys(telemetry)) {
    return {
      valid: false,
      error: 'Forbidden telemetry key (e.g. speed, position, heading, lane) strictly prohibited',
    }
  }
  const res = validateTelemetryReport(telemetry)
  if (!res.valid) {
    return { valid: false, error: res.errors.join('; ') }
  }
  return { valid: true }
}

/**
 * Validates a batch decision request (transport wrapper carrying telemetry).
 */
export function validateBatchDecisionRequest(request) {
  if (!request || typeof request !== 'object') {
    return { valid: false, error: 'BatchDecisionRequest must be an object' }
  }
  if (typeof request.tickId !== 'number' || request.tickId < 0) {
    return { valid: false, error: 'Invalid tickId: must be non-negative integer' }
  }
  if (!Array.isArray(request.cars)) {
    return { valid: false, error: 'cars must be an array' }
  }
  const batchRes = validateTelemetryBatch(request.cars)
  if (!batchRes.valid) {
    return { valid: false, error: `Batch invalid: ${batchRes.errors.join('; ')}` }
  }
  return { valid: true }
}

export function validateCarAction(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'CarAction must be an object' }
  }
  if (typeof action.id !== 'string' && typeof action.id !== 'number') {
    return { valid: false, error: 'CarAction id must be a string or number' }
  }
  if (!ACTION_TYPES.includes(action.action)) {
    return { valid: false, error: `Invalid action: must be one of ${ACTION_TYPES.join(', ')}` }
  }
  const val = action.throttle !== undefined ? action.throttle : action.intensity
  if (action.action === 'MAINTAIN') {
    if (
      val !== undefined &&
      (typeof val !== 'number' || val < 0.0 || val > 1.0 || !Number.isFinite(val))
    ) {
      return { valid: false, error: 'intensity/throttle must be between 0.0 and 1.0' }
    }
    return { valid: true }
  }
  if (typeof val !== 'number' || val < 0.0 || val > 1.0 || !Number.isFinite(val)) {
    return {
      valid: false,
      error: 'intensity/throttle must be a number between 0.0 and 1.0 inclusive',
    }
  }
  return { valid: true }
}

export function validateBatchDecisionResponse(response) {
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'BatchDecisionResponse must be an object' }
  }
  if (typeof response.tickId !== 'number' || response.tickId < 0) {
    return { valid: false, error: 'Invalid tickId: must be non-negative integer' }
  }
  if (!Array.isArray(response.actions)) {
    return { valid: false, error: 'actions must be an array' }
  }
  for (let i = 0; i < response.actions.length; i++) {
    const actRes = validateCarAction(response.actions[i])
    if (!actRes.valid) {
      return { valid: false, error: `Action [${i}] invalid: ${actRes.error}` }
    }
  }
  return { valid: true }
}
