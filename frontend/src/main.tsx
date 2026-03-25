import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { EntityProvider } from './context/EntityContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <EntityProvider>
        <App />
      </EntityProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
