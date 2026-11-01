/**
 * GRID LOCK — Phase 3 Telemetry Demo & Extraction Script
 *
 * Steps the real simulation engine with the baseline controller for 250 steps,
 * extracts a real telemetry report from an active vehicle with sensor readings,
 * validates it with Ajv, writes it to a temporary json file for Python Pydantic validation,
 * and demonstrates strict rejection of a corrupted payload containing an extra field.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEngine } from '../frontend/src/simulation/engine.js'
import { createSimpleSignalBaselineController } from '../frontend/src/controllers/baselineControllers.js'
import { buildLocalTelemetry, buildTelemetryBatch } from '../frontend/src/telemetry/buildLocalTelemetry.js'
import {
  serializeTelemetryReport,
  serializeTelemetryBatch,
  validateTelemetryReport,
} from '../frontend/src/telemetry/serializeTelemetryBatch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('=== Step 1: Initialize Real Engine & Step 250 Steps ===')
const engine = createEngine({ seed: 42 })
const controller = createSimpleSignalBaselineController()

for (let step = 0; step < 250; step++) {
  const snapshot = engine.getSnapshot()
  const actions = controller.getActions(snapshot)
  engine.applyActions(actions)
  engine.step()
}

const finalSnapshot = engine.getSnapshot()
const metrics = engine.getMetrics()
console.log(`Simulation reached Step ${finalSnapshot.step} (Sim Time: ${metrics.simTime})`)
console.log(`Active vehicles: ${metrics.activeVehicles}, Collisions: ${metrics.collisions}`)

// Find a moving vehicle with front, rear, or side reading
const batch = buildTelemetryBatch(finalSnapshot)
let chosenReport = null
for (const report of batch) {
  const hasFront = report.front !== null
  const hasRear = report.rear !== null
  const hasSide = report.side.left !== null || report.side.right !== null
  if (hasFront || hasRear || hasSide) {
    chosenReport = report
    break
  }
}

if (!chosenReport) {
  chosenReport = batch[0]
}

console.log(`\n=== Step 2: Real Telemetry Report Extracted from Vehicle #${chosenReport.id} ===`)
const serializedReport = serializeTelemetryReport(chosenReport, true)
console.log(serializedReport)

console.log('\n=== Step 3: Validate with JS (Ajv Draft-07) ===')
const jsRes = validateTelemetryReport(chosenReport)
console.log(`JS Validation Passed: ${jsRes.valid}`)

// Save sample report to scripts/sample_report.json for Python Pydantic validation
const samplePath = path.resolve(__dirname, 'sample_report.json')
fs.writeFileSync(samplePath, JSON.stringify(chosenReport, null, 2), 'utf-8')

// Step 4: Failing example (add extra field "speed")
console.log('\n=== Step 4: Failing Example (Extra Field "speed: 8.5") in JS ===')
const failingPayload = { ...chosenReport, speed: 8.5 }
const failingJsRes = validateTelemetryReport(failingPayload)
console.log(`Failing Payload Validation Result: ${failingJsRes.valid ? 'VALID (UNEXPECTED)' : 'REJECTED (EXPECTED)'}`)
console.log(`Ajv Error Details: ${failingJsRes.errors?.join('; ')}`)
try {
  serializeTelemetryReport(failingPayload)
} catch (err) {
  console.log(`Serializer Gate Exception: "${err.message}"`)
}

// Save failing report to scripts/failing_report.json for Python Pydantic validation
const failingPath = path.resolve(__dirname, 'failing_report.json')
fs.writeFileSync(failingPath, JSON.stringify(failingPayload, null, 2), 'utf-8')
