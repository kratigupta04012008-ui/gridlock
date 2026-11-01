import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEngine } from '../simulation/engine.js'
import { buildLocalTelemetry, buildTelemetryBatch } from '../telemetry/buildLocalTelemetry.js'
import {
  serializeTelemetryBatch,
  serializeTelemetryReport,
  validateTelemetryBatch,
  validateTelemetryReport,
} from '../telemetry/serializeTelemetryBatch.js'
import { computeFrontSensor } from '../telemetry/frontSensor.js'
import { computeRearSensor } from '../telemetry/rearSensor.js'
import { computeSideSensors } from '../telemetry/sideSensors.js'
import { computeSignalSensor } from '../telemetry/signalSensor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.resolve(__dirname, '../../../contracts/fixtures')
const VALID_DIR = path.join(FIXTURES_DIR, 'valid')
const INVALID_DIR = path.join(FIXTURES_DIR, 'invalid')

describe('Phase 3: Strict Local Telemetry Layer', () => {
  // ---------------------------------------------------------------------------
  // 1. Schema Conformance & Golden Fixtures
  // ---------------------------------------------------------------------------
  describe('Golden Fixtures & Pinned Fields', () => {
    it('accepts all golden valid fixtures with identical accept semantics', () => {
      const validFiles = fs.readdirSync(VALID_DIR).filter((f) => f.endsWith('.json'))
      expect(validFiles.length).toBeGreaterThan(0)

      for (const file of validFiles) {
        const content = fs.readFileSync(path.join(VALID_DIR, file), 'utf-8')
        const data = JSON.parse(content)
        const res = validateTelemetryBatch(data)
        expect(res.valid, `Valid fixture ${file} failed: ${res.errors?.join(', ')}`).toBe(true)
        // Serialization must succeed without throwing
        expect(() => serializeTelemetryBatch(data)).not.toThrow()
      }
    })

    it('rejects all golden invalid fixtures with identical reject semantics', () => {
      const invalidFiles = fs.readdirSync(INVALID_DIR).filter((f) => f.endsWith('.json'))
      expect(invalidFiles.length).toBeGreaterThan(0)

      for (const file of invalidFiles) {
        const content = fs.readFileSync(path.join(INVALID_DIR, file), 'utf-8')
        const data = JSON.parse(content)
        const res = validateTelemetryBatch(data)
        expect(res.valid, `Invalid fixture ${file} should have been rejected`).toBe(false)
        // Serialization must throw
        expect(() => serializeTelemetryBatch(data)).toThrow()
      }
    })

    it('strictly pins permitted top-level keys in telemetry reports', () => {
      const permittedKeys = ['front', 'id', 'rear', 'side', 'signal']
      const engine = createEngine({ seed: 42 })
      const snapshot = engine.getSnapshot()
      const report = buildLocalTelemetry(snapshot, 0)

      expect(Object.keys(report).sort()).toEqual(permittedKeys)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Functional Sensor Tests
  // ---------------------------------------------------------------------------
  describe('Functional Sensor Models', () => {
    it('detects nearest vehicle in front corridor and calculates bumper-to-bumper gap', () => {
      const ego = {
        id: 0,
        x: 40.0,
        y: 20.0,
        heading: Math.PI / 2, // Facing South (+y)
        velocity: 10.0,
        status: 'queued',
      }
      // Target directly in front at y = 30.0 (center-to-center = 10m, gap = 10 - 4.5 = 5.5m)
      const targetInCorridor = {
        id: 1,
        x: 40.0,
        y: 30.0,
        heading: Math.PI / 2,
        velocity: 8.0,
        status: 'queued',
      }
      // Second target further away at y = 38.0
      const targetFarther = {
        id: 2,
        x: 40.0,
        y: 38.0,
        heading: Math.PI / 2,
        velocity: 8.0,
        status: 'queued',
      }
      // Target outside corridor laterally at x = 46.0
      const targetOutsideCorridor = {
        id: 3,
        x: 46.0,
        y: 30.0,
        heading: Math.PI / 2,
        velocity: 8.0,
        status: 'queued',
      }

      const res = computeFrontSensor(ego, [
        ego,
        targetInCorridor,
        targetFarther,
        targetOutsideCorridor,
      ])
      expect(res).not.toBeNull()
      // Nearest target wins
      expect(res.distance).toBe(5.5) // (30 - 20) - 4.5 = 5.5m
      // Relative velocity: 8.0 - 10.0 = -2.0 m/s (closing / danger)
      expect(res.relativeVelocity).toBe(-2.0)
    })

    it('detects nearest vehicle in rear corridor with correct closing/opening sign', () => {
      const ego = {
        id: 0,
        x: 40.0,
        y: 20.0,
        heading: Math.PI / 2, // Facing South (+y)
        velocity: 10.0,
        status: 'queued',
      }
      // Target trailing behind ego at y = 10.0 (gap = 10 - 4.5 = 5.5m)
      const fasterTrailing = {
        id: 1,
        x: 40.0,
        y: 10.0,
        heading: Math.PI / 2,
        velocity: 12.0, // Trailing car is faster
        status: 'queued',
      }

      const resClosing = computeRearSensor(ego, [ego, fasterTrailing])
      expect(resClosing).not.toBeNull()
      expect(resClosing.distance).toBe(5.5)
      // Closing behind: v_ego - v_target = 10 - 12 = -2.0 m/s (negative = closing = danger)
      expect(resClosing.relativeVelocity).toBe(-2.0)

      // Slower trailing car (ego is pulling away)
      const slowerTrailing = { ...fasterTrailing, velocity: 7.0 }
      const resOpening = computeRearSensor(ego, [ego, slowerTrailing])
      expect(resOpening.relativeVelocity).toBe(3.0) // 10 - 7 = +3.0 m/s (opening)
    })

    it('verifies relative velocity matches numerical derivative of gap', () => {
      // Vehicle A (ego) at y = 20m, v = 10 m/s moving South (+y)
      // Vehicle B (target) at y = 35m, v = 6 m/s moving South (+y)
      const dt = 0.5 // seconds
      const ego0 = { id: 0, x: 40, y: 20, heading: Math.PI / 2, velocity: 10.0, status: 'queued' }
      const target0 = { id: 1, x: 40, y: 35, heading: Math.PI / 2, velocity: 6.0, status: 'queued' }

      const sensor0 = computeFrontSensor(ego0, [ego0, target0])
      expect(sensor0).not.toBeNull()
      const gap0 = sensor0.distance // (35 - 20) - 4.5 = 10.5m
      const reportedRelV = sensor0.relativeVelocity // 6.0 - 10.0 = -4.0 m/s

      // Move forward by dt at constant velocity
      const ego1 = { ...ego0, y: ego0.y + ego0.velocity * dt }
      const target1 = { ...target0, y: target0.y + target0.velocity * dt }

      const sensor1 = computeFrontSensor(ego1, [ego1, target1])
      const gap1 = sensor1.distance // 10.5 + (6 - 10)*0.5 = 8.5m

      const numericalRate = (gap1 - gap0) / dt // (8.5 - 10.5) / 0.5 = -4.0 m/s
      expect(reportedRelV).toBeCloseTo(numericalRate, 1)

      // Also verify rear sensor numerical rate
      const rearSensor0 = computeRearSensor(target0, [target0, ego0])
      const rearGap0 = rearSensor0.distance
      const rearRelV = rearSensor0.relativeVelocity // v_ego(target0) - v_trailing(ego0) = 6 - 10 = -4.0 m/s

      const rearSensor1 = computeRearSensor(target1, [target1, ego1])
      const rearGap1 = rearSensor1.distance
      const rearNumericalRate = (rearGap1 - rearGap0) / dt

      expect(rearRelV).toBeCloseTo(rearNumericalRate, 1)
    })

    it('detects left and right side vehicles and prevents side swapping', () => {
      const ego = {
        id: 0,
        x: 40.0,
        y: 20.0,
        heading: Math.PI / 2, // Facing South (+y). Left is +x, Right is -x.
        velocity: 0.0,
        status: 'queued',
      }
      // Target on Left (to the East, x = 43.0). Gap = (43 - 40) - 1.9 = 1.1m
      const leftTarget = {
        id: 1,
        x: 43.0,
        y: 20.0,
        heading: Math.PI / 2,
        velocity: 0.0,
        status: 'queued',
      }
      // Target on Right (to the West, x = 36.5). Gap = (40 - 36.5) - 1.9 = 1.6m
      const rightTarget = {
        id: 2,
        x: 36.5,
        y: 20.0,
        heading: Math.PI / 2,
        velocity: 0.0,
        status: 'queued',
      }

      const side = computeSideSensors(ego, [ego, leftTarget, rightTarget])
      expect(side.left).toBe(1.1)
      expect(side.right).toBe(1.6)

      // Test with only right target: left must be null
      const sideOnlyRight = computeSideSensors(ego, [ego, rightTarget])
      expect(sideOnlyRight.left).toBeNull()
      expect(sideOnlyRight.right).toBe(1.6)
    })

    it('computes signal state and distance to stop line, returning null after crossing or out of range', () => {
      // North approach stop line is at y = 32.4m. Front bumper is at y + 2.25m.
      const egoApproaching = {
        id: 0,
        x: 38.25,
        y: 20.0,
        approach: 'North',
        heading: Math.PI / 2,
        status: 'queued',
      }
      // Dist = 32.4 - (20 + 2.25) = 10.15 -> 10.1m
      const sig1 = computeSignalSensor(egoApproaching, 0)
      expect(sig1).not.toBeNull()
      expect(sig1.state).toBe('GREEN') // Step 0 is NS_GREEN
      expect(sig1.distanceToStopLine).toBe(10.1)

      // Vehicle past stop line: y = 31.0 (front bumper at 33.25m > 32.4m)
      const egoPastStopLine = {
        ...egoApproaching,
        y: 31.0,
      }
      const sigPast = computeSignalSensor(egoPastStopLine, 0)
      expect(sigPast).toBeNull()

      // Vehicle beyond max range: y = -35.0 (dist > 60m)
      const egoFarAway = {
        ...egoApproaching,
        y: -35.0,
      }
      const sigFar = computeSignalSensor(egoFarAway, 0)
      expect(sigFar).toBeNull()
    })

    it('returns null for all sensors when isolated, and produces valid report', () => {
      const isolatedEgo = {
        id: 99,
        x: 1000.0,
        y: 1000.0,
        heading: 0,
        velocity: 0,
        approach: null,
        status: 'queued',
      }
      const fakeSnapshot = {
        step: 0,
        vehicles: [isolatedEgo],
      }
      const report = buildLocalTelemetry(fakeSnapshot, 99)
      expect(report).toEqual({
        id: 99,
        front: null,
        rear: null,
        side: { left: null, right: null },
        signal: null,
      })
      expect(validateTelemetryReport(report).valid).toBe(true)
    })

    it('handles rotated/turning vehicles in the body frame mid-turn', () => {
      const egoTurning = {
        id: 0,
        x: 40.0,
        y: 40.0,
        heading: Math.PI / 4, // 45 degrees
        velocity: 5.0,
        status: 'moving',
      }
      // Target directly ahead along 45 degree vector by 10m
      const dist = 10.0
      const targetAhead = {
        id: 1,
        x: 40.0 + dist * Math.cos(Math.PI / 4),
        y: 40.0 + dist * Math.sin(Math.PI / 4),
        heading: Math.PI / 4,
        velocity: 5.0,
        status: 'moving',
      }

      const res = computeFrontSensor(egoTurning, [egoTurning, targetAhead])
      expect(res).not.toBeNull()
      expect(res.distance).toBe(5.5) // 10.0 - 4.5 = 5.5m
      expect(res.relativeVelocity).toBe(0.0)
    })

    it('produces exactly one report per active vehicle, ordered by id, excluding cleared', () => {
      const engine = createEngine({ seed: 42 })
      const snapshot = engine.getSnapshot()
      const batch = buildTelemetryBatch(snapshot)

      expect(batch.length).toBe(20)
      for (let i = 0; i < batch.length; i++) {
        expect(batch[i].id).toBe(i)
      }

      // Mark vehicle 3 as cleared
      snapshot.vehicles[3].status = 'cleared'
      const filteredBatch = buildTelemetryBatch(snapshot)
      expect(filteredBatch.length).toBe(19)
      expect(filteredBatch.find((r) => r.id === 3)).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Leak & Locality Tests (Proving Invariants)
  // ---------------------------------------------------------------------------
  describe('Leak & Locality Invariant Tests', () => {
    it('is strictly invariant under global rigid translations and rotations', () => {
      const engine = createEngine({ seed: 99 })
      const snapOriginal = engine.getSnapshot()
      const batchOriginal = buildTelemetryBatch(snapOriginal)
      expect(serializeTelemetryReport(batchOriginal[0])).toBeDefined()

      // Arbitrary rigid translation and rotation
      const tx = 250.75
      const ty = -180.25
      const rot = Math.PI / 3 // 60 degrees

      const cos = Math.cos(rot)
      const sin = Math.sin(rot)

      // Transform all vehicles
      const transformedVehicles = snapOriginal.vehicles.map((v) => ({
        ...v,
        x: v.x * cos - v.y * sin + tx,
        y: v.x * sin + v.y * cos + ty,
        heading: v.heading + rot,
      }))

      const snapTransformed = {
        ...snapOriginal,
        vehicles: transformedVehicles,
      }

      // Front, rear, and side sensors must be IDENTICAL because they are computed purely in body frame
      for (let i = 0; i < snapOriginal.vehicles.length; i++) {
        const egoOrig = snapOriginal.vehicles[i]
        const egoTrans = snapTransformed.vehicles[i]

        const fOrig = computeFrontSensor(egoOrig, snapOriginal.vehicles)
        const fTrans = computeFrontSensor(egoTrans, snapTransformed.vehicles)
        expect(fTrans).toEqual(fOrig)

        const rOrig = computeRearSensor(egoOrig, snapOriginal.vehicles)
        const rTrans = computeRearSensor(egoTrans, snapTransformed.vehicles)
        expect(rTrans).toEqual(rOrig)

        const sOrig = computeSideSensors(egoOrig, snapOriginal.vehicles)
        const sTrans = computeSideSensors(egoTrans, snapTransformed.vehicles)
        expect(sTrans).toEqual(sOrig)
      }
    })

    it('never leaks internal canary values into the serialized batch', () => {
      const engine = createEngine({ seed: 42 })
      const snapshot = engine.getSnapshot()

      // Inject unmistakable canary values into vehicle 0
      snapshot.vehicles[0].__canary = 'CANARY_LEAK_SECRET_12345'
      snapshot.vehicles[0].x = 987654.321
      snapshot.vehicles[0].y = 123456.789
      snapshot.vehicles[0].route = 'CANARY_CLASSIFIED_ROUTE'
      snapshot.vehicles[0].lane = 'CANARY_INTERNAL_LANE_9'
      snapshot.vehicles[0].color = 'CANARY_COLOR_HOTPINK'

      const batch = buildTelemetryBatch(snapshot)
      const serialized = serializeTelemetryBatch(batch)

      // Assert none of these canaries appear anywhere in the serialized batch
      expect(serialized).not.toContain('CANARY_LEAK_SECRET_12345')
      expect(serialized).not.toContain('987654.321')
      expect(serialized).not.toContain('123456.789')
      expect(serialized).not.toContain('CANARY_CLASSIFIED_ROUTE')
      expect(serialized).not.toContain('CANARY_INTERNAL_LANE_9')
      expect(serialized).not.toContain('CANARY_COLOR_HOTPINK')
      expect(serialized).not.toContain('speed')
      expect(serialized).not.toContain('heading')
      expect(serialized).not.toContain('velocity')
    })

    it('proves locality: modifying a distant vehicle or route does not affect vehicle 0 report', () => {
      const engine = createEngine({ seed: 42 })
      const snap1 = engine.getSnapshot()
      const report1 = buildLocalTelemetry(snap1, 0)

      // Clone vehicles
      const modifiedVehicles = snap1.vehicles.map((v) => ({ ...v }))
      // Change vehicle 15 (East approach) intended movement and route
      modifiedVehicles[15].movement = 'left'
      modifiedVehicles[15].pathIndex = 99
      // Move vehicle 19 far away
      modifiedVehicles[19].x = 999.0
      modifiedVehicles[19].y = 999.0

      const snap2 = { ...snap1, vehicles: modifiedVehicles }
      const report2 = buildLocalTelemetry(snap2, 0)

      expect(report2).toEqual(report1)
    })

    it('passes recursive key scan against strict denylist', () => {
      const forbidden = [
        'x',
        'y',
        'position',
        'speed',
        'velocity',
        'acceleration',
        'heading',
        'lane',
        'laneid',
        'route',
        'movement',
        'approach',
        'occupancy',
        'timestamp',
        'dimensions',
        'width',
        'length',
        'targetacceleration',
      ]

      const engine = createEngine({ seed: 42 })
      const batch = buildTelemetryBatch(engine.getSnapshot())

      function checkKeys(obj) {
        if (!obj || typeof obj !== 'object') return
        for (const [k, v] of Object.entries(obj)) {
          expect(forbidden.includes(k.toLowerCase())).toBe(false)
          checkKeys(v)
        }
      }

      checkKeys(batch)
    })

    it('is completely read-only: snapshot is not mutated and output is deterministic', () => {
      const engine = createEngine({ seed: 42 })
      const snapshot = engine.getSnapshot()
      const jsonBefore = JSON.stringify(snapshot)

      const batch1 = buildTelemetryBatch(snapshot)
      const s1 = serializeTelemetryBatch(batch1)

      const jsonAfter = JSON.stringify(snapshot)
      expect(jsonAfter).toBe(jsonBefore)

      const batch2 = buildTelemetryBatch(snapshot)
      const s2 = serializeTelemetryBatch(batch2)

      expect(s2).toBe(s1)
    })

    it('refuses to serialize an invalid batch and throws', () => {
      const invalidBatch = [
        {
          id: 0,
          front: null,
          rear: null,
          side: { left: null, right: null },
          signal: null,
          speed: 12.0, // FORBIDDEN extra field
        },
      ]

      expect(() => serializeTelemetryBatch(invalidBatch)).toThrow(/schema validation failed/)
    })
  })
})
