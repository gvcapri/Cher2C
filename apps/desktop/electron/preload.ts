import { contextBridge } from 'electron'

// Expõe APIs mínimas ao renderer (seguro)
contextBridge.exposeInMainWorld('cher2c', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
})
