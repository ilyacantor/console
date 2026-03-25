import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          className="flex-1 overflow-auto"
          style={{ background: '#F5F5F0', padding: '14px' }}
        >
          {children}
        </main>
      </div>

      {/* M button — non-functional in Phase 1 */}
      <button
        className="fixed z-50 flex items-center justify-center cursor-default"
        style={{
          bottom: '20px',
          right: '20px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#7C3AED',
          color: '#fff',
          fontWeight: 700,
          fontSize: '16px',
          border: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
        title="Maestra (coming soon)"
      >
        M
      </button>
    </div>
  )
}
