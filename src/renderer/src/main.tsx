import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, useMantineColorScheme } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App'
import './App.css'
import { useAppSettings } from './store/appSettingsStore'

const theme = createTheme({
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  primaryColor: 'teal',
  primaryShade: 6,
  defaultRadius: 'sm',
  components: {
    Button: {
      defaultProps: { size: 'xs' }
    }
  }
})

// Applies the persisted color scheme on first mount
function ThemeSync() {
  const { setColorScheme } = useMantineColorScheme()
  const colorScheme = useAppSettings((s) => s.colorScheme)
  useEffect(() => { setColorScheme(colorScheme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ThemeSync />
      <App />
    </MantineProvider>
  </React.StrictMode>
)
