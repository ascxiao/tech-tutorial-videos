const { spawn } = require('child_process');
const path = require('path');

console.log("==============================================");
console.log("  CREATOR DASHBOARD STANDALONE SERVICE BOOT   ");
console.log("==============================================");

console.log("[*] Starting local Express API backend server (port 3005)...");
const server = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit', shell: true });

console.log("[*] Starting Standalone Vite Creator Dashboard (port 3000)...");
const dashboard = spawn('npx', ['vite', '--force'], { stdio: 'inherit', shell: true });

console.log("[*] Starting Remotion Studio in background (port 3010)...");
const studio = spawn('npx', ['remotion', 'studio', '--port=3010'], { stdio: 'ignore', shell: true });

// Clean process termination handler
process.on('SIGINT', () => {
  console.log("\n[*] Safely terminating all concurrently running creator services...");
  server.kill();
  dashboard.kill();
  studio.kill();
  process.exit(0);
});
