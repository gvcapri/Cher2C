import React from 'react'
import ReactDOM from 'react-dom/client'
// CSS de entrada: reset + tokens de tema (resolva primeiro no bundle)
import './styles/global.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
