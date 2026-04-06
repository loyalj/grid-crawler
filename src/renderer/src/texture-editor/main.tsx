import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import { TextureEditorApp } from './TextureEditorApp'

const theme = createTheme({
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  primaryColor: 'teal',
  primaryShade: 6,
  defaultRadius: 'sm',
  components: {
    Button: { defaultProps: { size: 'xs' } }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <TextureEditorApp />
    </MantineProvider>
  </React.StrictMode>
)
