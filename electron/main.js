const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;

function startBackendServer() {
  const serverPath = path.resolve(__dirname, '..', 'scripts', 'server.js');
  console.log(`[*] Spawning background Express API server: ${serverPath}`);
  
  serverProcess = spawn('node', [serverPath], {
    shell: true,
    env: { ...process.env, PORT: 3005 }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Express stdout]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Express stderr]: ${data.toString().trim()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`[-] Express server exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Tech Video Creator Dashboard - Standalone App",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // Decide source
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Boot procedures
app.whenReady().then(() => {
  startBackendServer();
  
  // Wait a short duration for server port bindings before drawing visual browser frames!
  setTimeout(() => {
    createWindow();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Graceful cleanup handlers
app.on('window-all-closed', () => {
  if (serverProcess) {
    console.log('[*] Terminating Express backend server child processes...');
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
