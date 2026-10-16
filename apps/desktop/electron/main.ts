import { app, BrowserWindow, session, desktopCapturer } from 'electron'
import path from 'path'

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Cher2C',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Necessário p/ captura de tela/áudio (getDisplayMedia) e WebRTC
      backgroundThrottling: false
    }
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // __dirname = dist-electron → HTML gerado pelo vite em dist/renderer
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Habilita navigator.mediaDevices.getDisplayMedia no renderer.
  // No Electron essa API NÃO existe até o main configurar um handler de
  // captura de tela; sem isso o screen share falha com "getDisplayMedia not supported".
  // (Electron 31: apenas o handler, sem useSystemPicker — adicionado no v32+.)
  // Devolve a primeira tela/janela disponível como fallback.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        if (sources.length > 0) callback({ video: sources[0] })
        else callback({}) // cancela se não houver fonte
      })
      .catch(() => callback({}))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
