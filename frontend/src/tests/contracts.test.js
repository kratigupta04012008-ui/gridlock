import { describe, it, expect } from 'vitest'
import {
  validateCarTelemetry,
  validateBatchDecisionRequest,
  validateCarAction,
  validateBatchDecisionResponse,
} from '../contracts/schemas.js'

describe('Data Contracts & Telemetry Validation', () => {
  const validTelemetry = {
    id: 0,
    front: { distance: 15.5, relativeVelocity: -1.2 },
    rear: { distance: 8.0, relativeVelocity: 0.5 },
    side: { left: 1.8, right: 1.8 },
    signal: { state: 'GREEN', distanceToStopLine: 25.0 },
  }

  it('validates a compliant local-only car telemetry payload', () => {
    const res = validateCarTelemetry(validTelemetry)
    expect(res.valid).toBe(true)
  })

  it('strictly rejects any global spatial coordinate fields (x, y, etc.) in telemetry', () => {
    // Invariant: No global (x, y) coordinates or bird's-eye positions
    const forbiddenPayloadX = { ...validTelemetry, x: 380 }
    expect(validateCarTelemetry(forbiddenPayloadX).valid).toBe(false)
    expect(validateCarTelemetry(forbiddenPayloadX).error).toMatch(/Forbidden/)

    const forbiddenPayloadY = { ...validTelemetry, y: 290 }
    expect(validateCarTelemetry(forbiddenPayloadY).valid).toBe(false)

    const forbiddenPayloadPosition = { ...validTelemetry, position: { x: 10, y: 20 } }
    expect(validateCarTelemetry(forbiddenPayloadPosition).valid).toBe(false)

    const forbiddenPayloadGrid = { ...validTelemetry, grid: [1, 2] }
    expect(validateCarTelemetry(forbiddenPayloadGrid).valid).toBe(false)
  })

  it('strictly rejects own-speed field in telemetry', () => {
    // Phase 1 draft own-speed field is forbidden in Phase 3
    const forbiddenSpeed = { ...validTelemetry, speed: 11.2 }
    expect(validateCarTelemetry(forbiddenSpeed).valid).toBe(false)
  })

  it('validates a batch decision request containing 20 valid cars', () => {
    const cars = Array.from({ length: 20 }, (_, idx) => ({
      ...validTelemetry,
      id: idx,
    }))

    const batchRequest = {
      tickId: 101,
      cars,
    }

    const res = validateBatchDecisionRequest(batchRequest)
    expect(res.valid).toBe(true)
  })

  it('validates compliant CarAction objects', () => {
    expect(validateCarAction({ id: 'car-0', action: 'ACCELERATE', intensity: 0.8 }).valid).toBe(
      true
    )
    expect(validateCarAction({ id: 'car-1', action: 'BRAKE', intensity: 1.0 }).valid).toBe(true)
    expect(validateCarAction({ id: 'car-2', action: 'MAINTAIN', intensity: 0.0 }).valid).toBe(true)

    // Rejects invalid actions
    expect(validateCarAction({ id: 'car-0', action: 'SWERVE', intensity: 0.5 }).valid).toBe(false)

    // Rejects out of bound intensity
    expect(validateCarAction({ id: 'car-0', action: 'ACCELERATE', intensity: 1.5 }).valid).toBe(
      false
    )
    expect(validateCarAction({ id: 'car-0', action: 'ACCELERATE', intensity: -0.1 }).valid).toBe(
      false
    )
  })

  it('validates a compliant batch decision response', () => {
    const batchResponse = {
      tickId: 101,
      actions: [
        { id: 'car-0', action: 'ACCELERATE', intensity: 0.5 },
        { id: 'car-1', action: 'MAINTAIN', intensity: 0.0 },
      ],
    }

    expect(validateBatchDecisionResponse(batchResponse).valid).toBe(true)
  })
})
