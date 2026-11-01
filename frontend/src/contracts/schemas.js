/**
 * GRID LOCK — Data Contracts & Validation
 *
 * Invariant: Never allow global spatial coordinates (x, y, etc.) in telemetry.
 */

export const SIGNAL_STATES = Object.freeze(['RED', 'YELLOW', 'GREEN'])
export const ACTION_TYPES = Object.freeze(['ACCELERATE', 'BRAKE', 'MAINTAIN'])

export const FORBIDDEN_SPATIAL_KEYS = Object.freeze([
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
])

function containsForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return false
  const keys = Object.keys(obj).map((k) => k.toLowerCase())
  for (const forbidden of FORBIDDEN_SPATIAL_KEYS) {
    if (keys.includes(forbidden)) return true
  }
  return false
}

export function validateSensorReading(reading) {
  if (reading === null) return { valid: true }
  if (typeof reading !== 'object') {
    return { valid: false, error: 'Sensor reading must be an object or null' }
  }
  if (containsForbiddenKeys(reading)) {
    return { valid: false, error: 'Forbidden spatial coordinate detected in sensor reading' }
  }
  if (typeof reading.distance !== 'number' || reading.distance < 0 || !Number.isFinite(reading.distance)) {
    return { valid: false, error: 'Invalid distance: must be non-negative finite number' }
  }
  if (typeof reading.relativeVelocity !== 'number' || !Number.isFinite(reading.relativeVelocity)) {
    return { valid: false, error: 'Invalid relativeVelocity: must be finite number' }
  }
  return { valid: true }
}

export function validateSideProximity(side) {
  if (!side || typeof side !== 'object') {
    return { valid: false, error: 'Side proximity must be an object' }
  }
  if (containsForbiddenKeys(side)) {
    return { valid: false, error: 'Forbidden spatial coordinate detected in side proximity' }
  }
  if (typeof side.left !== 'number' || side.left < 0 || !Number.isFinite(side.left)) {
    return { valid: false, error: 'Invalid side.left: must be non-negative finite number' }
  }
  if (typeof side.right !== 'number' || side.right < 0 || !Number.isFinite(side.right)) {
    return { valid: false, error: 'Invalid side.right: must be non-negative finite number' }
  }
  return { valid: true }
}

export function validateSignalSensor(signal) {
  if (!signal || typeof signal !== 'object') {
    return { valid: false, error: 'Signal sensor must be an object' }
  }
  if (containsForbiddenKeys(signal)) {
    return { valid: false, error: 'Forbidden spatial coordinate detected in signal sensor' }
  }
  if (!SIGNAL_STATES.includes(signal.state)) {
    return { valid: false, error: `Invalid signal state: must be one of ${SIGNAL_STATES.join(', ')}` }
  }
  if (
    typeof signal.distanceToStopLine !== 'number' ||
    signal.distanceToStopLine < 0 ||
    !Number.isFinite(signal.distanceToStopLine)
  ) {
    return { valid: false, error: 'Invalid distanceToStopLine: must be non-negative finite number' }
  }
  return { valid: true }
}

export function validateCarTelemetry(telemetry) {
  if (!telemetry || typeof telemetry !== 'object') {
    return { valid: false, error: 'Car telemetry must be an object' }
  }
  if (containsForbiddenKeys(telemetry)) {
    return { valid: false, error: 'Forbidden spatial coordinates (e.g. x, y) strictly prohibited in telemetry' }
  }
  if (typeof telemetry.id !== 'string' && typeof telemetry.id !== 'number') {
    return { valid: false, error: 'Car id must be a string or number' }
  }
  if (typeof telemetry.speed !== 'number' || telemetry.speed < 0 || !Number.isFinite(telemetry.speed)) {
    return { valid: false, error: 'Invalid speed: must be non-negative finite number' }
  }

  const frontRes = validateSensorReading(telemetry.front)
  if (!frontRes.valid) return frontRes

  const rearRes = validateSensorReading(telemetry.rear)
  if (!rearRes.valid) return rearRes

  const sideRes = validateSideProximity(telemetry.side)
  if (!sideRes.valid) return sideRes

  const signalRes = validateSignalSensor(telemetry.signal)
  if (!signalRes.valid) return signalRes

  return { valid: true }
}

export function validateBatchDecisionRequest(request) {
  if (!request || typeof request !== 'object') {
    return { valid: false, error: 'BatchDecisionRequest must be an object' }
  }
  if (containsForbiddenKeys(request)) {
    return { valid: false, error: 'Forbidden spatial coordinate in batch request' }
  }
  if (typeof request.tickId !== 'number' || request.tickId < 0) {
    return { valid: false, error: 'Invalid tickId: must be non-negative integer' }
  }
  if (!Array.isArray(request.cars)) {
    return { valid: false, error: 'cars must be an array' }
  }
  for (let i = 0; i < request.cars.length; i++) {
    const carRes = validateCarTelemetry(request.cars[i])
    if (!carRes.valid) {
      return { valid: false, error: `Car [${i}] invalid: ${carRes.error}` }
    }
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
  if (
    typeof action.intensity !== 'number' ||
    action.intensity < 0.0 ||
    action.intensity > 1.0 ||
    !Number.isFinite(action.intensity)
  ) {
    return { valid: false, error: 'intensity must be a number between 0.0 and 1.0 inclusive' }
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
