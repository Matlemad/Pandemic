/**
 * Phone Host Server — WebSocket server running on the phone
 * 
 * This manages a LAN room hosted directly on a phone device.
 * Uses native modules for WebSocket server functionality.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { LanHostRoom, LanHostPeer, LanHostFile, LanHostConfig, DEFAULT_LAN_HOST_CONFIG, RelayTransfer } from './types';
import { VenueMessageType } from '../venue/types';

const { LanHostModule } = NativeModules as { LanHostModule: any };

// Check if the native module is available
export const isLanHostAvailable = LanHostModule != null;

export interface PhoneHostServerCallbacks {
  onClientConnected?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
  onClientMessage?: (clientId: string, message: any, isBinary: boolean) => void;
  onError?: (error: string, clientId?: string) => void;
  onStarted?: (port: number) => void;
  onStopped?: () => void;
}

/**
 * Phone Host Server
 * 
 * Manages a WebSocket server on the phone for hosting LAN rooms.
 */
export class PhoneHostServer {
  private config: LanHostConfig;
  private isRunning = false;
  private currentRoom: LanHostRoom | null = null;
  private peers: Map<string, LanHostPeer> = new Map();
  private files: Map<string, LanHostFile> = new Map();
  private transfers: Map<string, RelayTransfer> = new Map();
  private clientConnections: Set<string> = new Set();
  
  private nativeEmitter: NativeEventEmitter | null = null;
  private subscriptions: Array<{ remove: () => void }> = [];
  
  private callbacks: PhoneHostServerCallbacks = {};
  
  constructor(config: Partial<LanHostConfig> = {}) {
    this.config = { ...DEFAULT_LAN_HOST_CONFIG, ...config };
    
    if (isLanHostAvailable) {
      this.nativeEmitter = new NativeEventEmitter(LanHostModule);
      this.setupEventListeners();
    } else {
      console.warn('[PhoneHostServer] Native module not available');
    }
  }
  
  private setupEventListeners(): void {
    if (!this.nativeEmitter) return;
    
    // Remove any existing subscriptions first to prevent duplicates
    this.cleanup();
    
    const sub1 = this.nativeEmitter.addListener('lan_host_client_connected', (data: any) => {
      const clientId = data.clientId;
      this.clientConnections.add(clientId);
      console.log('[PhoneHostServer] Client connected:', clientId);
      this.callbacks.onClientConnected?.(clientId);
    });
    
    const sub2 = this.nativeEmitter.addListener('lan_host_client_disconnected', (data: any) => {
      const clientId = data.clientId;
      this.clientConnections.delete(clientId);
      console.log('[PhoneHostServer] Client disconnected:', clientId);
      // Remove peer if exists
      for (const [peerId, peer] of this.peers.entries()) {
        if (peer.peerId === clientId) {
          this.peers.delete(peerId);
          break;
        }
      }
      this.callbacks.onClientDisconnected?.(clientId);
    });
    
    const sub3 = this.nativeEmitter.addListener('lan_host_client_message', (data: any) => {
      const { clientId, message, isBinary } = data;
      
      // Check if it's a binary message (Android sends binary on same event with isBinary flag)
      if (isBinary) {
        // Binary message (base64 encoded) - don't try to parse as JSON
        this.callbacks.onClientMessage?.(clientId, message, true);
        return;
      }
      
      try {
        // Text message - parse as JSON
        const parsed = typeof message === 'string' ? JSON.parse(message) : message;
        this.callbacks.onClientMessage?.(clientId, parsed, false);
      } catch (error) {
        // Don't spam logs for binary data that was misidentified
        if (typeof message === 'string' && message.length < 500) {
          console.warn('[PhoneHostServer] Failed to parse message as JSON, treating as raw');
        }
        this.callbacks.onClientMessage?.(clientId, message, false);
      }
    });
    
    // Binary messages may also come on a separate event (iOS)
    const sub3b = this.nativeEmitter.addListener('lan_host_client_binary_message', (data: any) => {
      const { clientId, data: base64Data } = data;
      // Binary message (base64 encoded)
      this.callbacks.onClientMessage?.(clientId, base64Data, true);
    });
    
    const sub4 = this.nativeEmitter.addListener('lan_host_error', (data: any) => {
      console.error('[PhoneHostServer] Error:', data);
      this.callbacks.onError?.(data.message || 'Server error', data.clientId);
    });
    
    const sub5 = this.nativeEmitter.addListener('lan_host_started', (data: any) => {
      console.log('[PhoneHostServer] Server started on port', data.port);
      this.isRunning = true;
      this.callbacks.onStarted?.(data.port);
    });
    
    const sub6 = this.nativeEmitter.addListener('lan_host_stopped', () => {
      console.log('[PhoneHostServer] Server stopped');
      this.isRunning = false;
      this.callbacks.onStopped?.();
    });
    
    this.subscriptions = [sub1, sub2, sub3, sub3b, sub4, sub5, sub6];
  }
  
  /**
   * Set callbacks
   */
  setCallbacks(callbacks: PhoneHostServerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  /**
   * Start the WebSocket server
   */
  async start(room: LanHostRoom): Promise<boolean> {
    if (this.isRunning) {
      // Already running with this instance
      this.currentRoom = room;
      return true;
    }
    
    if (!isLanHostAvailable) {
      console.error('[PhoneHostServer] Native module not available');
      return false;
    }
    
    try {
      // Log local IPs for debugging
      try {
        const localIPs = await LanHostModule.getLocalIPs();
        console.log('[PhoneHostServer] ===========================================');
        console.log('[PhoneHostServer] Local IP addresses on this device:');
        for (const ip of localIPs) {
          console.log(`[PhoneHostServer]   ${ip.interface}: ${ip.ip}${ip.isIPv6 ? ' (IPv6)' : ''}`);
        }
        console.log('[PhoneHostServer] ===========================================');
      } catch (e) {
        console.warn('[PhoneHostServer] Could not get local IPs:', e);
      }
      
      // Try to stop any existing server first (handles hot reload)
      try {
        await LanHostModule.stopServer();
      } catch {
        // Ignore - server might not be running
      }
      
      await LanHostModule.startServer(this.config.port);
      this.isRunning = true;
      this.currentRoom = room;
      console.log('[PhoneHostServer] Server started on port', this.config.port);
      console.log('[PhoneHostServer] Clients should connect to: ws://<IP>:', this.config.port);
      return true;
    } catch (error: any) {
      // Handle "Address already in use" by stopping and retrying once
      if (error?.message?.includes('Address already in use')) {
        console.warn('[PhoneHostServer] Port in use, stopping and retrying...');
        try {
          await LanHostModule.stopServer();
          await new Promise(resolve => setTimeout(resolve, 500));
          await LanHostModule.startServer(this.config.port);
          this.isRunning = true;
          this.currentRoom = room;
          console.log('[PhoneHostServer] Server started on port', this.config.port);
          return true;
        } catch (retryError) {
          console.error('[PhoneHostServer] Retry failed:', retryError);
          return false;
        }
      }
      
      console.error('[PhoneHostServer] Failed to start server:', error);
      return false;
    }
  }
  
  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    if (isLanHostAvailable) {
      try {
        await LanHostModule.stopServer();
      } catch (error) {
        console.error('[PhoneHostServer] Failed to stop server:', error);
      }
    }
    
    this.isRunning = false;
    this.currentRoom = null;
    this.peers.clear();
    this.files.clear();
    this.transfers.clear();
    this.clientConnections.clear();
    console.log('[PhoneHostServer] Server stopped');
  }
  
  /**
   * Send message to a client
   */
  async sendToClient(clientId: string, message: any): Promise<boolean> {
    if (!isLanHostAvailable || !this.isRunning) {
      return false;
    }
    
    try {
      const json = typeof message === 'string' ? message : JSON.stringify(message);
      await LanHostModule.sendToClient(clientId, json);
      return true;
    } catch (error) {
      console.error('[PhoneHostServer] Failed to send message:', error);
      return false;
    }
  }
  
  /**
   * Send binary data to a client (base64 encoded)
   */
  async sendBinaryToClient(clientId: string, base64Data: string): Promise<boolean> {
    if (!isLanHostAvailable || !this.isRunning) {
      return false;
    }
    
    try {
      await LanHostModule.sendBinaryToClient(clientId, base64Data);
      return true;
    } catch (error) {
      console.error('[PhoneHostServer] Failed to send binary:', error);
      return false;
    }
  }
  
  /**
   * Broadcast message to all connected clients
   */
  async broadcast(message: any): Promise<void> {
    if (!isLanHostAvailable || !this.isRunning) {
      return;
    }
    
    try {
      const json = typeof message === 'string' ? message : JSON.stringify(message);
      await LanHostModule.broadcastMessage(json);
    } catch (error) {
      console.error('[PhoneHostServer] Failed to broadcast:', error);
    }
  }
  
  /**
   * Get connected client IDs
   */
  async getConnectedClients(): Promise<string[]> {
    if (!isLanHostAvailable || !this.isRunning) {
      return [];
    }
    
    try {
      return await LanHostModule.getConnectedClients();
    } catch (error) {
      console.error('[PhoneHostServer] Failed to get clients:', error);
      return Array.from(this.clientConnections);
    }
  }
  
  /**
   * Get current room
   */
  getRoom(): LanHostRoom | null {
    return this.currentRoom;
  }
  
  /**
   * Get all peers
   */
  getPeers(): LanHostPeer[] {
    return Array.from(this.peers.values());
  }
  
  /**
   * Get all files
   */
  getFiles(): LanHostFile[] {
    return Array.from(this.files.values());
  }
  
  /**
   * Add a peer
   */
  addPeer(peer: LanHostPeer): void {
    this.peers.set(peer.peerId, peer);
  }
  
  /**
   * Remove a peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    // Remove files owned by this peer
    for (const [fileId, file] of this.files.entries()) {
      if (file.ownerPeerId === peerId) {
        this.files.delete(fileId);
      }
    }
  }
  
  /**
   * Add a file
   */
  addFile(file: LanHostFile): void {
    this.files.set(file.id, file);
  }
  
  /**
   * Remove a file
   */
  removeFile(fileId: string): void {
    this.files.delete(fileId);
  }
  
  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
  
  /**
   * Check if native module is available
   */
  isAvailable(): boolean {
    return isLanHostAvailable;
  }
  
  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clientConnections.size;
  }
  
  /**
   * Cleanup event subscriptions
   */
  private cleanup(): void {
    for (const sub of this.subscriptions) {
      try {
        sub.remove();
      } catch {
        // Ignore errors when removing subscriptions
      }
    }
    this.subscriptions = [];
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.stop();
    this.cleanup();
    this.callbacks = {};
  }
}

// Export singleton
export const phoneHostServer = new PhoneHostServer();
export default phoneHostServer;
