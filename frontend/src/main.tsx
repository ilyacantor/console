import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import SurfaceStateSync from './components/SurfaceStateSync'
import { HealthProvider } from './context/HealthContext'
import { SurfaceExtrasProvider } from './context/SurfaceExtrasContext'
import { TourProvider } from './context/TourContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <HealthProvider>
        <SurfaceExtrasProvider>
          <SurfaceStateSync />
          <TourProvider>
            <App />
          </TourProvider>
        </SurfaceExtrasProvider>
      </HealthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
