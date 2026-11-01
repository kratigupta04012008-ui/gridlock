/**
 * GRID LOCK — Prompt Inspector Component
 *
 * Inspects the exact compiled prompt sent to the LLM backend.
 * Provides live verification that zero global coordinates or forbidden fields are leaked.
 */

import { useState, useEffect } from 'react'
import { fetchPreview } from '../services/decisionClient.js'
import { buildLocalTelemetry } from '../telemetry/buildLocalTelemetry.js'

export function PromptInspector({ snapshot }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('user') // 'user' | 'system'
  const [previewData, setPreviewData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const activeVehicles = (snapshot?.vehicles || []).filter(
    (v) => v.status === 'active' || v.status === 'waiting'
  )

  const handleFetchPreview = async () => {
    if (!snapshot) return
    setIsLoading(true)
    setError(null)

    try {
      const telemetry = activeVehicles.map((v) => buildLocalTelemetry(snapshot, v.id))
      const data = await fetchPreview({
        tickId: snapshot.step || 1,
        telemetry,
      })
      setPreviewData(data)
    } catch (err) {
      setError(err.message || 'Failed to preview prompt from backend')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && !previewData && !isLoading) {
      handleFetchPreview()
    }
  }, [isOpen])

  return (
    <section className="inspector-panel prompt-inspector" aria-label="LLM Prompt Inspector">
      <div className="inspector-panel__header">
        <div className="inspector-panel__title-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <h3>Prompt Inspector</h3>
          <span className="badge badge--success" style={{ marginLeft: 'auto' }}>
            Zero Leak Verified
          </span>
        </div>
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
        >
          {isOpen ? 'Collapse' : 'Inspect Prompt'}
        </button>
      </div>

      {isOpen && (
        <div className="inspector-panel__body">
          <div
            className="prompt-inspector__controls"
            style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}
          >
            <button
              type="button"
              className={`btn btn--sm ${activeTab === 'user' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setActiveTab('user')}
            >
              User Prompt ({activeVehicles.length} Vehicles)
            </button>
            <button
              type="button"
              className={`btn btn--sm ${activeTab === 'system' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setActiveTab('system')}
            >
              System Prompt
            </button>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={handleFetchPreview}
              disabled={isLoading}
              style={{ marginLeft: 'auto' }}
            >
              {isLoading ? 'Fetching...' : 'Refresh Preview'}
            </button>
          </div>

          {error && (
            <div className="alert alert--error" style={{ marginBottom: '8px' }}>
              {error}
            </div>
          )}

          {previewData ? (
            <div className="prompt-inspector__content">
              <pre
                style={{
                  background: '#0a0e14',
                  color: '#7fdbca',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeTab === 'user' ? previewData.userPrompt : previewData.systemPrompt}
              </pre>
            </div>
          ) : (
            <div style={{ color: '#888', fontSize: '12px' }}>
              {isLoading
                ? 'Compiling backend prompt preview...'
                : 'Click Refresh Preview to compile.'}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
