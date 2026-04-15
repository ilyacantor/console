import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { EngagementProvider } from './context/EngagementContext'
import { ModeProvider } from './context/ModeContext'
import { EntityProvider } from './context/EntityContext'
import { HealthProvider } from './context/HealthContext'
import { MaiPageContextProvider } from './context/MaiPageContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MaiPageContextProvider>
        <EngagementProvider>
          <ModeProvider>
            <EntityProvider>
              <HealthProvider>
                <App />
              </HealthProvider>
            </EntityProvider>
          </ModeProvider>
        </EngagementProvider>
      </MaiPageContextProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
