import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import SurfaceStateSync from './components/SurfaceStateSync'
import { EngagementProvider } from './context/EngagementContext'
import { ModeProvider } from './context/ModeContext'
import { EntityProvider } from './context/EntityContext'
import { HealthProvider } from './context/HealthContext'
import { SurfaceExtrasProvider } from './context/SurfaceExtrasContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <EngagementProvider>
        <ModeProvider>
          <EntityProvider>
            <HealthProvider>
              <SurfaceExtrasProvider>
                <SurfaceStateSync />
                <App />
              </SurfaceExtrasProvider>
            </HealthProvider>
          </EntityProvider>
        </ModeProvider>
      </EngagementProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
