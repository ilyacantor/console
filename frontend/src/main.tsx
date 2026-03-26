import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { EntityProvider } from './context/EntityContext'
import { HealthProvider } from './context/HealthContext'
import { MaestraPageContextProvider } from './context/MaestraPageContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MaestraPageContextProvider>
        <EntityProvider>
          <HealthProvider>
            <App />
          </HealthProvider>
        </EntityProvider>
      </MaestraPageContextProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
