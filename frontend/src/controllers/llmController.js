/**
 * GRID LOCK — LLM Batch Traffic Controller
 *
 * Imports ONLY telemetry definitions and decision service/scheduler.
 * Strictly forbidden to import engine, physics, collision detector, or geometry internals.
 */

import { fetchDecisions } from '../services/decisionClient.js'
import { DecisionScheduler } from '../services/decisionScheduler.js'

/**
 * Creates an LLM Batch Traffic Controller instance.
 *
 * @param {object} options
 * @param {Function} options.onApplyActions - Callback to apply accepted actions
 * @param {string} [options.clockPolicy='lockstep'] - 'lockstep' or 'realtime'
 * @param {number} [options.decisionIntervalSteps=50] - Steps between decision ticks
 * @returns {object} LLM Controller interface
 */
export function createLLMController(options = {}) {
  const { onApplyActions, clockPolicy = 'lockstep', decisionIntervalSteps = 250 } = options

  const scheduler = new DecisionScheduler({
    fetchDecisionsFn: fetchDecisions,
    onApplyActions,
    clockPolicy,
    decisionIntervalSteps,
  })

  return {
    name: 'LLM Batch Controller (Phase 4)',
    description: 'Autonomous multi-agent control via single batch LLM API call per tick.',
    isLLM: true,
    scheduler,

    /**
     * Called on each engine step. Delegates scheduling and boundary handling.
     */
    step(stepCounter, simTime, getActiveTelemetryFn) {
      return scheduler.checkStep(stepCounter, simTime, getActiveTelemetryFn)
    },

    /**
     * Resets scheduler state.
     */
    reset() {
      scheduler.reset()
    },

    /**
     * Resumes scheduler from halted or rate-limited state.
     */
    resume() {
      scheduler.resume()
    },

    /**
     * Returns live status and metrics for the HUD.
     */
    getMetrics() {
      return scheduler.getMetrics()
    },
  }
}
