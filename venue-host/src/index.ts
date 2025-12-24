/**
 * Venue Host — Main entry point
 * 
 * Local LAN venue host for cross-platform P2P audio sharing.
 * Provides mDNS discovery + WebSocket communication + file relay.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import Bonjour from 'bonjour-service';
import { networkInterfaces } from 'os';
import { config as loadEnv } from 'dotenv';

import { RoomManager } from './room-manager.js';
import { WebSocketHandler } from './ws-handler.js';
import { VenueHostConfig, DEFAULT_CONFIG } from './types.js';

// Load environment variables
loadEnv();

// ============================================================================
// CONFIGURATION
// ============================================================================

const config: VenueHostConfig = {
  port: parseInt(process.env.PORT || String(DEFAULT_CONFIG.port), 10),
  roomName: process.env.ROOM_NAME || DEFAULT_CONFIG.roomName,
  serviceName: process.env.SERVICE_NAME || DEFAULT_CONFIG.serviceName,
  maxFileMB: parseInt(process.env.MAX_FILE_MB || String(DEFAULT_CONFIG.maxFileMB), 10),
  heartbeatTimeoutMs: DEFAULT_CONFIG.heartbeatTimeoutMs,
  cleanupIntervalMs: DEFAULT_CONFIG.cleanupIntervalMs,
};

// ============================================================================
// UTILITIES
// ============================================================================

function getLocalIPs(): string[] {
  const ips: string[] = [];
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    
    for (const net of nets) {
      // Skip internal and non-IPv4 addresses
      if (net.internal || net.family !== 'IPv4') continue;
      ips.push(net.address);
    }
  }
  
  return ips;
}

function printBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🦠 PANDEMIC VENUE HOST                                      ║
║   Cross-platform audio sharing via local Wi-Fi                ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   Service: ${config.serviceName.padEnd(48)}║
║   Room:    ${config.roomName.padEnd(48)}║
║   Port:    ${String(config.port).padEnd(48)}║
║   Max file: ${(config.maxFileMB + ' MB').padEnd(47)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

function printLocalIPs(): void {
  const ips = getLocalIPs();
  
  console.log('📡 Local network addresses:');
  if (ips.length === 0) {
    console.log('   ⚠️  No network interfaces found');
  } else {
    for (const ip of ips) {
      console.log(`   • ws://${ip}:${config.port}`);
    }
  }
  console.log();
}

function printMdnsInfo(): void {
  console.log('🔍 mDNS Service Advertisement:');
  console.log(`   Type: _audiowallet._tcp`);
  console.log(`   Name: ${config.serviceName}`);
  console.log(`   TXT:  v=1, room=${config.roomName}, relay=1`);
  console.log();
}

function printInstructions(): void {
  console.log('📱 How to test:');
  console.log('   1. Connect phone(s) to the same Wi-Fi network as this host');
  console.log('   2. Open Pandemic app on Android or iOS');
  console.log('   3. Look for "Venue Rooms" section in the app');
  console.log('   4. Tap to join this venue room');
  console.log();
  console.log('🔧 Environment variables:');
  console.log('   PORT         WebSocket port (default: 8787)');
  console.log('   ROOM_NAME    Room display name');
  console.log('   SERVICE_NAME mDNS service name');
  console.log('   MAX_FILE_MB  Max file size in MB (default: 50)');
  console.log();
}

// ============================================================================
// MAIN SERVER
// ============================================================================

async function main(): Promise<void> {
  printBanner();
  printLocalIPs();
  
  // Initialize room manager
  const roomManager = new RoomManager(config);
  const wsHandler = new WebSocketHandler(roomManager, config);
  
  // Create HTTP server with dashboard
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        ...roomManager.getStats(),
      }));
    } else if (req.url === '/api/stats') {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      const stats = roomManager.getStats() as any;
      const files = roomManager.getRoomFiles('default');
      const peers = roomManager.getRoomPeers('default');
      res.end(JSON.stringify({
        ...stats,
        files: files.map(f => ({
          id: f.id,
          title: f.title,
          artist: f.artist,
          size: f.size,
          ownerName: f.ownerName,
          addedAt: f.addedAt,
        })),
        peers: peers.map(p => ({
          peerId: p.peerId,
          deviceName: p.deviceName,
          platform: p.platform,
          fileCount: p.sharedFiles.size,
          joinedAt: p.joinedAt,
        })),
      }));
    } else if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Pandemic Venue Host - Dashboard</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 20px; color: #00ff88; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 25px; }
    .stat-card { 
      background: rgba(255,255,255,0.1); 
      padding: 20px; 
      border-radius: 12px;
      text-align: center;
    }
    .stat-value { font-size: 36px; font-weight: bold; color: #00ff88; }
    .stat-label { font-size: 14px; color: #888; margin-top: 5px; }
    .section { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h2 { font-size: 18px; margin-bottom: 15px; color: #fff; }
    .item { 
      background: rgba(255,255,255,0.05); 
      padding: 12px 15px; 
      border-radius: 8px; 
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .item-title { font-weight: 500; }
    .item-meta { font-size: 12px; color: #888; }
    .badge { 
      background: #00ff88; 
      color: #1a1a2e; 
      padding: 4px 10px; 
      border-radius: 12px; 
      font-size: 12px;
      font-weight: bold;
    }
    .empty { text-align: center; color: #666; padding: 30px; }
    .refresh { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
    .log { 
      background: #0a0a15; 
      padding: 15px; 
      border-radius: 8px; 
      font-family: monospace; 
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
    }
    .log-entry { margin-bottom: 5px; }
    .log-time { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🦠 Pandemic Venue Host</h1>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="peerCount">-</div>
        <div class="stat-label">Connected Peers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="fileCount">-</div>
        <div class="stat-label">Shared Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="transferCount">-</div>
        <div class="stat-label">Active Transfers</div>
      </div>
    </div>
    
    <div class="section">
      <h2>📱 Connected Peers</h2>
      <div id="peerList"><div class="empty">No peers connected</div></div>
    </div>
    
    <div class="section">
      <h2>🎵 Shared Files</h2>
      <div id="fileList"><div class="empty">No files shared yet</div></div>
    </div>
    
    <div class="section">
      <h2>📋 Recent Activity</h2>
      <div class="log" id="activityLog">
        <div class="log-entry"><span class="log-time">[${new Date().toLocaleTimeString()}]</span> Dashboard opened</div>
      </div>
    </div>
    
    <div class="refresh">Auto-refreshing every 2 seconds</div>
  </div>
  
  <script>
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
      return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }
    
    function formatTime(ts) {
      return new Date(ts).toLocaleTimeString();
    }
    
    let lastPeerCount = 0;
    let lastFileCount = 0;
    
    async function refresh() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        document.getElementById('peerCount').textContent = data.peerCount || 0;
        document.getElementById('fileCount').textContent = data.defaultRoom?.fileCount || 0;
        document.getElementById('transferCount').textContent = data.activeTransfers || 0;
        
        // Update peer list
        const peerList = document.getElementById('peerList');
        if (data.peers && data.peers.length > 0) {
          peerList.innerHTML = data.peers.map(p => \`
            <div class="item">
              <div>
                <div class="item-title">\${p.deviceName}</div>
                <div class="item-meta">\${p.platform} • \${p.fileCount} files • Joined \${formatTime(p.joinedAt)}</div>
              </div>
              <span class="badge">🟢 Online</span>
            </div>
          \`).join('');
        } else {
          peerList.innerHTML = '<div class="empty">No peers connected</div>';
        }
        
        // Update file list
        const fileList = document.getElementById('fileList');
        if (data.files && data.files.length > 0) {
          fileList.innerHTML = data.files.map(f => \`
            <div class="item">
              <div>
                <div class="item-title">\${f.title}</div>
                <div class="item-meta">\${f.artist || 'Unknown'} • \${formatSize(f.size)} • from \${f.ownerName}</div>
              </div>
            </div>
          \`).join('');
        } else {
          fileList.innerHTML = '<div class="empty">No files shared yet</div>';
        }
        
        // Log changes
        const log = document.getElementById('activityLog');
        const now = new Date().toLocaleTimeString();
        
        if (data.peerCount !== lastPeerCount) {
          const diff = data.peerCount - lastPeerCount;
          log.innerHTML = \`<div class="log-entry"><span class="log-time">[\${now}]</span> Peer \${diff > 0 ? 'connected' : 'disconnected'} (total: \${data.peerCount})</div>\` + log.innerHTML;
          lastPeerCount = data.peerCount;
        }
        
        if ((data.defaultRoom?.fileCount || 0) !== lastFileCount) {
          log.innerHTML = \`<div class="log-entry"><span class="log-time">[\${now}]</span> Files updated (total: \${data.defaultRoom?.fileCount || 0})</div>\` + log.innerHTML;
          lastFileCount = data.defaultRoom?.fileCount || 0;
        }
        
      } catch (e) {
        console.error('Refresh error:', e);
      }
    }
    
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>
      `);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer });
  
  wss.on('connection', (ws) => {
    wsHandler.handleConnection(ws);
  });
  
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
  
  // Start HTTP/WS server
  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`✅ WebSocket server listening on port ${config.port}`);
    console.log();
  });
  
  // Start mDNS advertisement
  const bonjour = new Bonjour.default();
  
  const service = bonjour.publish({
    name: config.serviceName,
    type: 'audiowallet',
    port: config.port,
    txt: {
      v: '1',
      room: config.roomName,
      relay: '1',
    },
  });
  
  service.on('up', () => {
    printMdnsInfo();
    printInstructions();
    console.log('🎉 Venue host is ready! Waiting for connections...');
    console.log('   Press Ctrl+C to stop\n');
  });
  
  service.on('error', (error: Error) => {
    console.error('mDNS advertisement error:', error.message);
  });
  
  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\n🛑 Shutting down...');
    
    service.stop(() => {
      console.log('   mDNS service stopped');
    });
    
    bonjour.destroy();
    
    wss.close(() => {
      console.log('   WebSocket server closed');
    });
    
    httpServer.close(() => {
      console.log('   HTTP server closed');
    });
    
    roomManager.destroy();
    
    setTimeout(() => {
      console.log('👋 Goodbye!\n');
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Log stats periodically
  setInterval(() => {
    const stats = roomManager.getStats() as any;
    if (stats.peerCount > 0) {
      console.log(
        `📊 Stats: ${stats.peerCount} peers, ` +
        `${stats.defaultRoom.fileCount} files, ` +
        `${stats.activeTransfers} active transfers`
      );
    }
  }, 30000);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

