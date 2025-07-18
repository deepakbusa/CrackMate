const { app, BrowserWindow, screen, ipcMain, desktopCapturer, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

function createWindow() {
  const { width, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 600;
  const minHeight = 150;

  const win = new BrowserWindow({
    width: winWidth,
    height: minHeight,
    x: Math.floor((width - winWidth) / 2),
    y: 0,
    resizable: false,
    minHeight: minHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    title: "SecureWindow",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Set alwaysOnTop to 'screen-saver' level for maximum persistence
  win.setAlwaysOnTop(true, 'screen-saver');

  // Prevent screen capture/screen recording
  //win.setContentProtection(true);

  // Handle renderer resize requests
  ipcMain.on('resize-window', (event, { width, height }) => {
    win.setResizable(true);
    win.setSize(width, height);
    win.setResizable(false);
  });

  // Handle window movement requests
  ipcMain.on('move-window', (event, { direction, step }) => {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const [currentX, currentY] = win.getPosition();
    const [winWidth, winHeight] = win.getSize();

    let newX = currentX;
    let newY = currentY;

    switch (direction) {
      case 'up':
        newY -= step;
        break;
      case 'down':
        newY += step;
        break;
      case 'left':
        newX -= step;
        break;
      case 'right':
        newX += step;
        break;
      default:
        break;
    }

    newX = Math.max(0, Math.min(newX, screenWidth - winWidth));
    newY = Math.max(0, Math.min(newY, screenHeight - winHeight));

    win.setPosition(newX, newY);
  });

  // Handle screen capture requests
  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      if (sources.length > 0) {
        return sources[0].thumbnail.toDataURL();
      }
      throw new Error('No screen sources available.');
    } catch (error) {
      console.error('Screen capture failed:', error.message);
      throw new Error(`Failed to capture screen: ${error.message}`);
    }
  });

  // Handle visibility toggle
  ipcMain.on('toggle-visibility', (event, shouldShow) => {
    if (shouldShow) {
      win.show();
      win.focus(); // Ensure window is brought to front
    } else {
      win.hide();
    }
  });

  win.loadURL('http://localhost:3001');

  // Register global shortcuts
  app.whenReady().then(() => {
    // Move window shortcuts
    globalShortcut.register('Control+Up', () => {
      win.webContents.send('shortcut', { action: 'moveWindow', direction: 'up' });
    });
    globalShortcut.register('Control+Down', () => {
      win.webContents.send('shortcut', { action: 'moveWindow', direction: 'down' });
    });
    globalShortcut.register('Control+Left', () => {
      win.webContents.send('shortcut', { action: 'moveWindow', direction: 'left' });
    });
    globalShortcut.register('Control+Right', () => {
      win.webContents.send('shortcut', { action: 'moveWindow', direction: 'right' });
    });
    // Screenshot
    globalShortcut.register('Control+H', () => {
      win.webContents.send('shortcut', { action: 'takeScreenshot' });
    });
    // Start over
    globalShortcut.register('Control+G', () => {
      win.webContents.send('shortcut', { action: 'startOver' });
    });
    // Toggle visibility (Ctrl+.)
    globalShortcut.register('Control+.', () => {
      // Stealth mode: Only hide/show the window, do not send any message to renderer or trigger DOM/UI events
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    });
    // Quit app (Ctrl+Q)
    globalShortcut.register('Control+Q', () => {
      app.quit();
    });
    // Solve screenshots (Ctrl+Enter)
    globalShortcut.register('Control+Enter', () => {
      win.webContents.send('shortcut', { action: 'solveScreenshots' });
    });
    // Mic toggle (Ctrl+M)
    globalShortcut.register('Control+M', () => {
      win.webContents.send('shortcut', { action: 'toggleMic' });
    });
  });

  // Unregister all shortcuts on quit
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

