import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MaestraFloat from './MaestraPanel'

export default function Layout({ children }: { children: ReactNode }) {
  const [floatSideOpen, setFloatSideOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          className="flex-1 overflow-auto"
          style={{
            background: 'var(--bg-base)',
            padding: '14px',
            marginRight: floatSideOpen ? '420px' : 0,
            transition: 'margin-right 0.2s ease',
          }}
        >
          {children}
        </main>
      </div>

      <MaestraFloat
        currentPage={location.pathname}
        onSideOpen={setFloatSideOpen}
      />
    </div>
  )
}
