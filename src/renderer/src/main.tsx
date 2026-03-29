import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App'
import './App.css'

const theme = createTheme({
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  primaryColor: 'yellow',
  primaryShade: 6,
  colors: {
    // Map accent gold onto a Mantine color scale
    yellow: [
      '#fdf6e3', '#f5e6c0', '#e8cc8a', '#d9b060',
      '#c8a96e', '#b8933a', '#9a7a28', '#7a6118',
      '#5a4610', '#3a2c08'
    ]
  },
  defaultRadius: 'sm',
  components: {
    Button: {
      defaultProps: { size: 'xs' }
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
)
