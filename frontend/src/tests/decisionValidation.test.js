/**
 * GRID LOCK — Tests for Decision Validation & ID Reconciliation
 */

import { describe, it, expect } from 'vitest'
import { validateDecisionResponse, validateDecisionIdSet } from '../contracts/decisionValidation.js'

import validMixed from '../../../contracts/fixtures/decisions/valid/valid_mixed.json' with { type: 'json' }
import validBounds from '../../../contracts/fixtures/decisions/valid/valid_bounds.json' with { type: 'json' }
import validMaintain from '../../../contracts/fixtures/decisions/valid/valid_maintain_only.json' with { type: 'json' }

import extraFieldTop from '../../../contracts/fixtures/decisions/invalid/extra_field_top.json' with { type: 'json' }
import accelIntensity from '../../../contracts/fixtures/decisions/invalid/accelerate_with_intensity.json' with { type: 'json' }
import brakeThrottle from '../../../contracts/fixtures/decisions/invalid/brake_with_throttle.json' with { type: 'json' }
import maintainThrottle from '../../../contracts/fixtures/decisions/invalid/maintain_with_throttle.json' with { type: 'json' }
import throttleOOB from '../../../contracts/fixtures/decisions/invalid/throttle_out_of_bounds.json' with { type: 'json' }
import intensityNegative from '../../../contracts/fixtures/decisions/invalid/intensity_negative.json' with { type: 'json' }
import unknownAction from '../../../contracts/fixtures/decisions/invalid/unknown_action.json' with { type: 'json' }
import nonIntId from '../../../contracts/fixtures/decisions/invalid/non_integer_id.json' with { type: 'json' }

describe('Decision Schema Validation (Ajv)', () => {
  it('accepts valid mixed decisions fixture', () => {
    const res = validateDecisionResponse(validMixed)
    expect(res.valid).toBe(true)
  })

  it('accepts valid bounds decisions fixture (0.0 and 1.0)', () => {
    const res = validateDecisionResponse(validBounds)
    expect(res.valid).toBe(true)
  })

  it('accepts valid maintain-only decisions fixture', () => {
    const res = validateDecisionResponse(validMaintain)
    expect(res.valid).toBe(true)
  })

  it('rejects extra top-level field (reasoning)', () => {
    const res = validateDecisionResponse(extraFieldTop)
    expect(res.valid).toBe(false)
  })

  it('rejects ACCELERATE having intensity field', () => {
    const res = validateDecisionResponse(accelIntensity)
    expect(res.valid).toBe(false)
  })

  it('rejects BRAKE having throttle field', () => {
    const res = validateDecisionResponse(brakeThrottle)
    expect(res.valid).toBe(false)
  })

  it('rejects MAINTAIN having throttle field', () => {
    const res = validateDecisionResponse(maintainThrottle)
    expect(res.valid).toBe(false)
  })

  it('rejects throttle > 1.0', () => {
    const res = validateDecisionResponse(throttleOOB)
    expect(res.valid).toBe(false)
  })

  it('rejects negative intensity < 0.0', () => {
    const res = validateDecisionResponse(intensityNegative)
    expect(res.valid).toBe(false)
  })

  it('rejects unknown action string', () => {
    const res = validateDecisionResponse(unknownAction)
    expect(res.valid).toBe(false)
  })

  it('rejects non-integer vehicle id', () => {
    const res = validateDecisionResponse(nonIntId)
    expect(res.valid).toBe(false)
  })
})

describe('Decision ID Set Reconciliation', () => {
  it('accepts exact matching ID set', () => {
    const decisions = [
      { id: 1, action: 'ACCELERATE', throttle: 0.5 },
      { id: 2, action: 'BRAKE', intensity: 0.8 },
      { id: 3, action: 'MAINTAIN' },
    ]
    const res = validateDecisionIdSet(decisions, [1, 2, 3])
    expect(res.valid).toBe(true)
  })

  it('rejects missing vehicle ID in decisions', () => {
    const decisions = [
      { id: 1, action: 'ACCELERATE', throttle: 0.5 },
      { id: 2, action: 'BRAKE', intensity: 0.8 },
    ]
    const res = validateDecisionIdSet(decisions, [1, 2, 3])
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Missing vehicles: [3]')
  })

  it('rejects extra vehicle ID in decisions', () => {
    const decisions = [
      { id: 1, action: 'ACCELERATE', throttle: 0.5 },
      { id: 2, action: 'BRAKE', intensity: 0.8 },
      { id: 4, action: 'MAINTAIN' },
    ]
    const res = validateDecisionIdSet(decisions, [1, 2])
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Extra unknown vehicles: [4]')
  })

  it('rejects duplicate vehicle IDs in decisions', () => {
    const decisions = [
      { id: 1, action: 'ACCELERATE', throttle: 0.5 },
      { id: 1, action: 'BRAKE', intensity: 0.8 },
    ]
    const res = validateDecisionIdSet(decisions, [1])
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Duplicate decision IDs: 1')
  })
})
