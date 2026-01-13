/**
 * Venue Host — Main entry point
 * 
 * Local LAN venue host for cross-platform P2P audio sharing.
 * Provides mDNS discovery + WebSocket communication + file relay.
 * Dashboard for venue operator control.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer } from 'ws';
import Bonjour from 'bonjour-service';
import { networkInterfaces } from 'os';
import { config as loadEnv } from 'dotenv';
import { exec } from 'child_process';

import { RoomManager } from './room-manager.js';
import { WebSocketHandler } from './ws-handler.js';
import { VenueHostConfig, DEFAULT_CONFIG } from './types.js';
import { hostState, HostRoom } from './host-state.js';
import { handleAdminRequest } from './admin-api.js';
import { getDashboardHtml } from './dashboard.js';

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
// MDNS SERVICE
// ============================================================================

let bonjour: InstanceType<typeof Bonjour.default> | null = null;
let mdnsService: any = null;

let mdnsUpdatePending = false;
let lastMdnsUpdate = 0;
const MDNS_UPDATE_THROTTLE_MS = 1000;

function startMdns(room: HostRoom): void {
  try {
    stopMdns();
    
    bonjour = new Bonjour.default();
    
    mdnsService = bonjour.publish({
      name: config.serviceName,
      type: 'audiowallet',
      port: config.port,
      txt: {
        v: '1',
        room: room.name,
        lock: room.locked ? '1' : '0',
        relay: '1',
      },
    });
    
    mdnsService.on('up', () => {
      console.log(`[mDNS] Service advertised: ${config.serviceName}`);
      console.log(`[mDNS] Room: ${room.name} (${room.locked ? 'Locked' : 'Unlocked'})`);
    });
    
    mdnsService.on('error', (error: Error) => {
      console.error('[mDNS] Error:', error.message);
    });
  } catch (err) {
    console.error('[mDNS] Failed to start:', err);
  }
}

function stopMdns(): void {
  try {
    if (mdnsService) {
      mdnsService.stop();
      mdnsService = null;
    }
    if (bonjour) {
      bonjour.destroy();
      bonjour = null;
    }
  } catch (err) {
    console.error('[mDNS] Failed to stop:', err);
    mdnsService = null;
    bonjour = null;
  }
}

function updateMdns(room: HostRoom): void {
  // Throttle mDNS updates to prevent rapid restarts
  const now = Date.now();
  if (now - lastMdnsUpdate < MDNS_UPDATE_THROTTLE_MS) {
    if (!mdnsUpdatePending) {
      mdnsUpdatePending = true;
      setTimeout(() => {
        mdnsUpdatePending = false;
        const currentRoom = hostState.getRoom();
        if (currentRoom) {
          lastMdnsUpdate = Date.now();
          startMdns(currentRoom);
        }
      }, MDNS_UPDATE_THROTTLE_MS);
    }
    return;
  }
  
  lastMdnsUpdate = now;
  startMdns(room);
}

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
║   Port:    ${String(config.port).padEnd(48)}║
║   Max file: ${(config.maxFileMB + ' MB').padEnd(47)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

// ============================================================================
// MAIN SERVER
// ============================================================================

async function main(): Promise<void> {
  printBanner();
  
  const ips = getLocalIPs();
  console.log('📡 Local network addresses:');
  for (const ip of ips) {
    console.log(`   • ws://${ip}:${config.port}`);
  }
  console.log();
  
  // Initialize room manager with host state integration
  const roomManager = new RoomManager(config);
  const wsHandler = new WebSocketHandler(roomManager, config);
  
  // Integrate host state with room manager
  const existingRoom = hostState.getRoom();
  if (existingRoom) {
    roomManager.updateDefaultRoom(existingRoom.name, existingRoom.id);
    console.log(`[Init] Loaded room from disk: ${existingRoom.name}`);
    
    // Publish host files to room
    const hostFiles = hostState.getPublishedFiles();
    if (hostFiles.length > 0) {
      roomManager.setHostFiles(hostFiles);
      console.log(`[Init] Loaded ${hostFiles.length} host files`);
    }
  }
  
  // Listen for host state changes
  hostState.onChange((state) => {
    try {
      if (state.room) {
        // Update room and broadcast to connected peers
        roomManager.updateDefaultRoom(state.room.name, state.room.id, true);
        roomManager.setHostFiles(state.hostFiles || [], true);
        updateMdns(state.room);
      } else {
        // Room closed - stop mDNS and clear host files
        stopMdns();
        roomManager.setHostFiles([], true);
        console.log('[Host] Room closed, mDNS stopped');
      }
    } catch (err) {
      console.error('[Host] Error in onChange handler:', err);
    }
  });
  
  // Create HTTP server
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '';
    
    // Handle Admin API (localhost only or for dev)
    if (url.startsWith('/admin')) {
      const handled = await handleAdminRequest(req, res);
      if (handled) return;
    }
    
    // Health check
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        room: hostState.getRoom(),
        ...roomManager.getStats(),
      }));
      return;
    }
    
    // Stats API
    if (url === '/api/stats') {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      const stats = roomManager.getStats() as any;
      const defaultRoomId = roomManager.getDefaultRoomId();
      const files = roomManager.getRoomFiles(defaultRoomId);
      const peers = roomManager.getRoomPeers(defaultRoomId);
      res.end(JSON.stringify({
        ...stats,
        room: hostState.getRoom(),
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
      return;
    }
    
    // Dashboard
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getDashboardHtml(config.port));
      return;
    }
    
    // 404
    res.writeHead(404);
    res.end('Not Found');
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
    console.log(`✅ Server listening on port ${config.port}`);
    console.log(`🌐 Dashboard: http://localhost:${config.port}`);
    console.log();
    
    // Start mDNS if room exists
    const room = hostState.getRoom();
    if (room) {
      startMdns(room);
    } else {
      console.log('⚠️  No room configured yet. Create one in the dashboard.');
    }
    
    console.log('📱 Instructions:');
    console.log('   1. Open dashboard in browser');
    console.log('   2. Create a room name');
    console.log('   3. Upload audio files');
    console.log('   4. Connect phones to join and download');
    console.log();
    console.log('🔑 Admin token:', hostState.getAdminToken().substring(0, 8) + '...');
    console.log();
    
    // Open browser
    setTimeout(() => {
      openBrowser(`http://localhost:${config.port}`);
    }, 500);
  });
  
  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\n🛑 Shutting down...');
    
    stopMdns();
    
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
        `${stats.defaultRoom?.fileCount || 0} files, ` +
        `${stats.activeTransfers} active transfers`
      );
    }
  }, 30000);
}

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[CRITICAL] Uncaught exception:', error);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to keep running
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
