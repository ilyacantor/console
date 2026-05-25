/**
 * Credentials + Edge Agent — Stage 3 of the deployment tour.
 *
 * Three regions:
 *   1. Credential checklist with per-app validation state (live progression
 *      driven by snapshot ordinal).
 *   2. Edge Agent install command (copyable).
 *   3. :443 outbound tunnel diagram (static SVG; outbound-only is the point).
 */

import { useState } from 'react'
import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import {
  credentialsAtStage,
  EDGE_AGENT_INSTALL_COMMAND,
  STAGE_BY_ID,
  type CredentialItem,
  type StageId,
} from '../demo/seed'

export default function Credentials() {
  const snapshot = useEnvSnapshot()
  const data = snapshot
    ? credentialsAtStage(snapshot)
    : { validated: 0, pending: 0, blocked: 0, total: 0, items: [] as CredentialItem[] }
  const [copied, setCopied] = useState(false)

  useSurfaceExtras('page:credentials', {
    visible_panels: ['Credentials checklist', 'Edge Agent install', 'Outbound tunnel diagram'],
    extra: {
      page: 'credentials',
      credentials_validated: data.validated,
      credentials_pending: data.pending,
      credentials_blocked: data.blocked,
      credentials_total: data.total,
    },
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(EDGE_AGENT_INSTALL_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
          Credentials + Edge Agent
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Mai produces the credential checklist. Each one is validated as it arrives.
          Edge Agent install command below; outbound HTTPS on 443 only.
        </div>
      </div>

      {!snapshot && (
        <div
          data-testid="credentials-empty-state"
          style={{
            border: '0.5px solid var(--border)',
            borderRadius: '10px',
            padding: '24px',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No active deployment. Start the tour to see Crestline's credentials flow in.
        </div>
      )}

      {snapshot && (
        <>
          <div
            data-testid="credentials-summary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
            }}
          >
            <Stat label="Validated" value={String(data.validated)} color="#22C55E" testId="cred-stat-validated" />
            <Stat label="Pending" value={String(data.pending)} color="#F59E0B" testId="cred-stat-pending" />
            <Stat label="Blocked" value={String(data.blocked)} color="#EF4444" testId="cred-stat-blocked" />
            <Stat label="Total" value={String(data.total)} color="var(--text-secondary)" testId="cred-stat-total" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Edge Agent install + tunnel diagram */}
            <div
              style={{
                border: '0.5px solid var(--border)',
                borderRadius: '10px',
                padding: '14px',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                Edge Agent install
              </div>
              <div
                data-testid="edge-install-command"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '10px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {EDGE_AGENT_INSTALL_COMMAND}
              </div>
              <button
                data-testid="edge-install-copy"
                onClick={handleCopy}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  background: copied ? 'rgba(34,197,94,0.22)' : 'rgba(11,202,217,0.18)',
                  color: copied ? '#86EFAC' : '#0BCAD9',
                  border: '0.5px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied ✓' : 'Copy install command'}
              </button>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Outbound tunnel (no inbound ports)
                </div>
                <TunnelDiagram />
              </div>
            </div>

            {/* Checklist */}
            <div
              style={{
                border: '0.5px solid var(--border)',
                borderRadius: '10px',
                padding: '14px',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                Credential checklist
              </div>
              <ul
                data-testid="credentials-list"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  maxHeight: '360px',
                  overflowY: 'auto',
                  fontSize: '12px',
                }}
              >
                {data.items.map((c) => {
                  const status = credentialStatus(c, snapshot)
                  return (
                    <li
                      key={c.app_id}
                      data-testid="credential-row"
                      data-app-id={c.app_id}
                      data-status={status}
                      style={{
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border)',
                        display: 'grid',
                        gridTemplateColumns: '20px 1fr auto',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <StatusIcon status={status} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{c.app_name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {c.required_credential}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: statusColor(status),
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {status}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type CredStatus = 'validated' | 'pending' | 'blocked'

function credentialStatus(c: CredentialItem, snapshotId: StageId): CredStatus {
  if (c.validated_by_stage_ordinal === null) return 'blocked'
  const stageOrdinal = STAGE_BY_ID[snapshotId].ordinal
  return c.validated_by_stage_ordinal <= stageOrdinal ? 'validated' : 'pending'
}

function statusColor(s: CredStatus): string {
  if (s === 'validated') return '#22C55E'
  if (s === 'pending') return '#F59E0B'
  return '#EF4444'
}

function StatusIcon({ status }: { status: CredStatus }) {
  const color = statusColor(status)
  return (
    <span
      style={{
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
      }}
      aria-hidden
    />
  )
}

function Stat({
  label,
  value,
  color,
  testId,
}: {
  label: string
  value: string
  color: string
  testId: string
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid var(--border)',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function TunnelDiagram() {
  return (
    <svg
      data-testid="tunnel-diagram"
      viewBox="0 0 320 90"
      style={{ width: '100%', height: 'auto', maxHeight: 110 }}
      aria-label="Outbound HTTPS 443 tunnel from Edge Agent to AOS relay"
    >
      {/* Customer edge */}
      <rect x="6" y="22" width="86" height="46" rx="6" fill="rgba(34,197,94,0.10)" stroke="#22C55E" strokeWidth="0.8" />
      <text x="49" y="42" textAnchor="middle" fill="#22C55E" fontSize="11" fontWeight="600">
        Edge Agent
      </text>
      <text x="49" y="56" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
        customer
      </text>

      {/* Arrow */}
      <line x1="92" y1="45" x2="216" y2="45" stroke="#0BCAD9" strokeWidth="1.4" strokeDasharray="3 3" />
      <polygon points="216,45 210,42 210,48" fill="#0BCAD9" />
      <text x="154" y="38" textAnchor="middle" fill="#0BCAD9" fontSize="10" fontWeight="600">
        HTTPS · TCP 443
      </text>
      <text x="154" y="62" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
        outbound only · no inbound ports
      </text>

      {/* AOS relay */}
      <rect x="220" y="22" width="86" height="46" rx="6" fill="rgba(11,202,217,0.12)" stroke="#0BCAD9" strokeWidth="0.8" />
      <text x="263" y="42" textAnchor="middle" fill="#0BCAD9" fontSize="11" fontWeight="600">
        AOS Relay
      </text>
      <text x="263" y="56" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
        edge-relay.aos
      </text>
    </svg>
  )
}
