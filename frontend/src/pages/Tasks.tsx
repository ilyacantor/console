export default function Tasks() {
  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Tasks</h1>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Pending review</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>0</div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Completed today</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>0</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>Human review queue</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Mappings and reclassifications requiring human decision
          </div>
        </div>
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No items pending review.
        </div>
      </div>
    </div>
  )
}
