/**
 * GRID LOCK — Telemetry Serializer & Validation Gate
 *
 * The SINGLE AUTHORIZED SERIALIZATION PATH for telemetry.
 *
 * Invariants:
 * 1. Strict Ajv schema validation must pass before any serialization occurs.
 * 2. Invalid payloads throw an Error immediately — no invalid string can ever be produced.
 * 3. Stable key sorting guarantees deterministic, byte-identical output across runs.
 */

import Ajv from 'ajv'
import telemetrySchema from '../contracts/telemetry.schema.json' with { type: 'json' }

const ajv = new Ajv({ allErrors: true, strict: false })

// Compile validators for both the entire batch and single vehicle reports
export const validateBatch = ajv.compile(telemetrySchema)
export const validateReport = ajv.compile({
  $schema: 'http://json-schema.org/draft-07/schema#',
  ...telemetrySchema.definitions.VehicleTelemetryReport,
  definitions: telemetrySchema.definitions,
})

/**
 * Recursively sorts object keys alphabetically to ensure deterministic string output.
 */
export function sortKeysRecursively(val) {
  if (val === null || typeof val !== 'object') return val
  if (Array.isArray(val)) return val.map(sortKeysRecursively)
  const sorted = {}
  for (const k of Object.keys(val).sort()) {
    sorted[k] = sortKeysRecursively(val[k])
  }
  return sorted
}

function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return 'Unknown schema violation'
  return errors
    .map((e) => {
      const path = e.instancePath || '/'
      return `${path}: ${e.message} (${JSON.stringify(e.params)})`
    })
    .join('; ')
}

/**
 * Validates a single vehicle report against the schema.
 * Returns { valid: boolean, errors: string[] | null }.
 */
export function validateTelemetryReport(report) {
  const valid = validateReport(report)
  if (!valid) {
    return {
      valid: false,
      errors: validateReport.errors
        ? validateReport.errors.map((e) => `${e.instancePath || '/'}: ${e.message}`)
        : ['Invalid'],
    }
  }
  return { valid: true, errors: null }
}

/**
 * Validates a telemetry batch against the schema.
 * Returns { valid: boolean, errors: string[] | null }.
 */
export function validateTelemetryBatch(batch) {
  const valid = validateBatch(batch)
  if (!valid) {
    return {
      valid: false,
      errors: validateBatch.errors
        ? validateBatch.errors.map((e) => `${e.instancePath || '/'}: ${e.message}`)
        : ['Invalid'],
    }
  }
  return { valid: true, errors: null }
}

/**
 * Serializes a single vehicle telemetry report to a deterministic JSON string.
 * Throws an Error if schema validation fails.
 *
 * @param {Object} report - Single vehicle telemetry report
 * @param {boolean} [pretty=false] - Whether to format with indentation
 * @returns {string} Deterministic JSON string
 */
export function serializeTelemetryReport(report, pretty = false) {
  const valid = validateReport(report)
  if (!valid) {
    throw new Error(
      `Vehicle telemetry report schema validation failed: ${formatAjvErrors(validateReport.errors)}`
    )
  }
  const sorted = sortKeysRecursively(report)
  return JSON.stringify(sorted, null, pretty ? 2 : undefined)
}

/**
 * Serializes a telemetry batch to a deterministic JSON string.
 * Throws an Error if schema validation fails.
 *
 * @param {Array<Object>} batch - Batch of vehicle telemetry reports
 * @param {boolean} [pretty=false] - Whether to format with indentation
 * @returns {string} Deterministic JSON string
 */
export function serializeTelemetryBatch(batch, pretty = false) {
  const valid = validateBatch(batch)
  if (!valid) {
    throw new Error(
      `Telemetry batch schema validation failed: ${formatAjvErrors(validateBatch.errors)}`
    )
  }
  const sorted = sortKeysRecursively(batch)
  return JSON.stringify(sorted, null, pretty ? 2 : undefined)
}
