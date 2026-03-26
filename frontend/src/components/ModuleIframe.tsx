import { useEffect, useRef, useState } from 'react'
import { useHealth } from '../context/HealthContext'
import { useEntity } from '../context/EntityContext'

interface ModuleIframeProps {
  serviceName: string
  baseUrl: string
  title: string
  entityParam?: boolean
  minHeight?: string
  height?: string
}

export default function ModuleIframe({
  serviceName,
  baseUrl,
  title,
  entityParam = true,
  minHeight = '600px',
  height = 'calc(100vh - 72px)',
}: ModuleIframeProps) {
  const { health, getServiceStatus } = useHealth()
  const { selected } = useEntity()
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const svc = getServiceStatus(serviceName)
  const isDown = svc?.status === 'down'

  // Build iframe URL with optional entity param
  let iframeSrc = baseUrl
  if (entityParam && selected) {
    const sep = baseUrl.includes('?') ? '&' : '?'
    // Entity param not yet consumed by NLQ/DCL — passed for future use
    iframeSrc = `${baseUrl}${sep}entity=${encodeURIComponent(selected)}`
  }

  // Reset loaded/timeout state when entity changes (iframe remounts via key)
  useEffect(() => {
    setIframeLoaded(false)
    setTimedOut(false)
  }, [selected])

  // 15-second timeout for iframe load
  useEffect(() => {
    if (iframeLoaded || isDown) return

    timerRef.current = setTimeout(() => {
      setTimedOut(true)
    }, 15_000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [iframeLoaded, isDown, selected])

  const handleLoad = () => {
    setIframeLoaded(true)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  // Health not yet loaded — show loading
  if (!health) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '40px', textAlign: 'center' }}>
        Checking service health...
      </div>
    )
  }

  // Service is down per health check
  if (isDown) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          minHeight,
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}
      >
        <div>{serviceName} service unavailable</div>
        {svc?.detail && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '400px', textAlign: 'center' }}>
            {svc.detail}
          </div>
        )}
        <a
          href={baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3B82F6', fontSize: '12px', textDecoration: 'none' }}
        >
          Open in new tab
        </a>
      </div>
    )
  }

  // Timed out waiting for iframe to load
  if (timedOut && !iframeLoaded) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          minHeight,
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}
      >
        <div>{serviceName} service unavailable</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Iframe failed to load within 15 seconds
        </div>
        <a
          href={baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3B82F6', fontSize: '12px', textDecoration: 'none' }}
        >
          Open in new tab
        </a>
      </div>
    )
  }

  return (
    <>
      {!iframeLoaded && (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '40px', textAlign: 'center' }}>
          Loading {title}...
        </div>
      )}
      <iframe
        key={selected ?? 'all'}
        src={iframeSrc}
        onLoad={handleLoad}
        style={{
          width: '100%',
          minHeight,
          height,
          border: 'none',
          display: iframeLoaded ? 'block' : 'none',
        }}
        title={title}
      />
    </>
  )
}
