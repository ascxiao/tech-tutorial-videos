const { spawn } = require('child_process');
const path = require('path');

console.log("==============================================");
console.log("   CREATOR DASHBOARD DESKTOP DEVELOPMENT      ");
console.log("==============================================");

console.log("[*] Starting Standalone Vite Dashboard (port 3000)...");
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

console.log("[*] Booting Electron Window Shell...");
// Give Vite a brief window to start up before spawning the Electron window
setTimeout(() => {
  const electronProcess = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  electronProcess.on('close', () => {
    console.log("[*] Electron closed. Terminating Vite server...");
    vite.kill();
    process.exit(0);
  });
}, 2000);

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
