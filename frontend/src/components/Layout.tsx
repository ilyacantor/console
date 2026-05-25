import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MaiFloat from './MaiPanel'
import TourOverlay from './TourOverlay'
import TimelineStrip from './TimelineStrip'
import { useTour } from '../context/TourContext'

const TOUR_OVERLAY_HEIGHT = 72
const TIMELINE_STRIP_HEIGHT = 54

export default function Layout({ children }: { children: ReactNode }) {
  const [floatSideOpen, setFloatSideOpen] = useState(false)
  const location = useLocation()
  const { isActive: tourActive } = useTour()

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
      <TopBar />
      <TourOverlay />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          className="flex-1 overflow-auto"
          style={{
            background: 'var(--bg-base)',
            padding: '14px',
            paddingTop: tourActive ? `${TOUR_OVERLAY_HEIGHT + 14}px` : '14px',
            paddingBottom: tourActive ? `${TIMELINE_STRIP_HEIGHT + 14}px` : '14px',
            marginRight: floatSideOpen ? '420px' : 0,
            transition: 'margin-right 0.2s ease, padding 0.2s ease',
          }}
        >
          {children}
        </main>
      </div>

      <TimelineStrip />

      <MaiFloat
        currentPage={location.pathname}
        onSideOpen={setFloatSideOpen}
      />
    </div>
  )
}
