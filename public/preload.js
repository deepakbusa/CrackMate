const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Expose any APIs here if needed in the future
});

contextBridge.exposeInMainWorld('electron', {
  setSize: (width, height) => {
    ipcRenderer.send('resize-window', { width, height });
  },
  moveWindow: (direction, step) => {
    ipcRenderer.send('move-window', { direction, step });
  },
  saveScreenshot: (dataUrl) => {
    ipcRenderer.send('save-screenshot', dataUrl);
  },
  captureScreen: async () => {
    return await ipcRenderer.invoke('capture-screen');
  },
  toggleVisibility: (shouldShow) => {
    ipcRenderer.send('toggle-visibility', shouldShow);
  },
  onShortcut: (callback) => {
    ipcRenderer.on('shortcut', (event, data) => {
      callback(data);
    });
  },
});