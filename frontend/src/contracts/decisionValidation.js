/**
 * GRID LOCK — Decision Schema Validation & ID Reconciliation
 *
 * Enforces Ajv validation against decisions.schema.json and exact ID set match.
 */

import Ajv from 'ajv'
import decisionsSchema from './decisions.schema.json' with { type: 'json' }

const ajv = new Ajv({ allErrors: true, strict: false })
export const validateSchema = ajv.compile(decisionsSchema)

function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return ['Unknown schema violation']
  return errors.map((e) => `${e.instancePath || '/'} ${e.message}`)
}

/**
 * Validates raw payload against decisions JSON schema.
 * @param {object} payload
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateDecisionResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Decision payload must be an object'] }
  }
  const valid = validateSchema(payload)
  if (!valid) {
    return { valid: false, errors: formatAjvErrors(validateSchema.errors) }
  }
  return { valid: true }
}

/**
 * Validates that returned decision IDs exactly match the expected set of active vehicle IDs.
 * @param {Array<{ id: number, action: string }>} decisions
 * @param {Set<number>|Array<number>} expectedIds
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDecisionIdSet(decisions, expectedIds) {
  const expectedSet = new Set(expectedIds)
  const decisionIds = decisions.map((d) => d.id)

  // Check for duplicates
  const seen = new Set()
  const duplicates = []
  for (const id of decisionIds) {
    if (seen.has(id)) {
      duplicates.push(id)
    }
    seen.add(id)
  }

  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Duplicate decision IDs: ${duplicates.join(', ')}`,
    }
  }

  const returnedSet = new Set(decisionIds)
  const missing = [...expectedSet].filter((id) => !returnedSet.has(id))
  const extra = [...returnedSet].filter((id) => !expectedSet.has(id))

  if (missing.length > 0 || extra.length > 0) {
    const errs = []
    if (missing.length > 0)
      errs.push(`Missing vehicles: [${missing.sort((a, b) => a - b).join(', ')}]`)
    if (extra.length > 0)
      errs.push(`Extra unknown vehicles: [${extra.sort((a, b) => a - b).join(', ')}]`)
    return { valid: false, error: errs.join('; ') }
  }

  return { valid: true }
}
