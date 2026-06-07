const { spawn } = require('child_process');
const path = require('path');

console.log("==============================================");
console.log("  CREATOR DASHBOARD STANDALONE SERVICE BOOT   ");
console.log("==============================================");

console.log("[*] Starting local Express API backend server (port 3005)...");
const server = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit', shell: true });

console.log("[*] Starting Standalone Vite Creator Dashboard (port 3000)...");
const dashboard = spawn('npx', ['vite', '--force', '--open'], { stdio: 'inherit', shell: true });

// Clean process termination handler
process.on('SIGINT', () => {
  console.log("\n[*] Safely terminating all concurrently running creator services...");
  server.kill();
  dashboard.kill();
  process.exit(0);
});
