/**
 * Venue LAN Transport — WebSocket-based transport for venue host communication
 * 
 * Standalone transport for venue mode (no inheritance to avoid require cycles).
 */

import { Platform } from 'react-native';
import { nanoid } from 'nanoid/non-secure';
import {
  DiscoveredVenueHost,
  VenueMessageType,
  VenueConnectionState,
  VenuePeer,
} from './types';
import { venueRelay } from './relay';

// Re-define minimal types locally to avoid import cycles
interface VenueSharedFile {
  id: string;
  title: string;
  artist?: string;
  size: number;
  mimeType: string;
  sha256: string;
  ownerPeerId: string;
  ownerName: string;
  duration?: number;
  addedAt?: number;
}

interface VenueRoomInfo {
  roomId: string;
  roomName: string;
  hostId: string;
  peerCount: number;
  locked?: boolean;
}

// ============================================================================
// VENUE LAN TRANSPORT
// ============================================================================

export class VenueLanTransport {
  private ws: WebSocket | null = null;
  private connectionState: VenueConnectionState = VenueConnectionState.DISCONNECTED;
  private currentHost: DiscoveredVenueHost | null = null;
  private currentRoomId: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  
  // Identity
  private localPeerId: string;
  private displayName: string = 'Pandemic User';
  
  // Room state
  private sharedFiles: Map<string, VenueSharedFile> = new Map();
  private roomPeers: Map<string, VenuePeer> = new Map();
  
  // Local files that we're sharing (fileId -> localUri)
  private localFileUris: Map<string, { uri: string; size: number; mimeType: string }> = new Map();
  
  // Callbacks
  private onConnectionStateChange: ((state: VenueConnectionState) => void) | null = null;
  private onRoomJoined: ((info: VenueRoomInfo) => void) | null = null;
  private onPeerJoined: ((peer: VenuePeer) => void) | null = null;
  private onPeerLeft: ((peerId: string) => void) | null = null;
  private onFilesUpdated: ((files: VenueSharedFile[]) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onDisconnected: (() => void) | null = null;

  constructor() {
    this.localPeerId = `${Platform.OS}-${nanoid(8)}`;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  setDisplayName(name: string): void {
    this.displayName = name;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getLocalPeerId(): string {
    return this.localPeerId;
  }

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  setOnConnectionStateChange(callback: (state: VenueConnectionState) => void): void {
    this.onConnectionStateChange = callback;
  }

  setOnRoomJoined(callback: (info: VenueRoomInfo) => void): void {
    this.onRoomJoined = callback;
  }

  setOnPeerJoined(callback: (peer: VenuePeer) => void): void {
    this.onPeerJoined = callback;
    // Immediately call with existing peers if any
    if (this.roomPeers.size > 0) {
      console.log('[VenueLan] Calling onPeerJoined immediately for', this.roomPeers.size, 'existing peers');
      for (const peer of this.roomPeers.values()) {
        callback(peer);
      }
    }
  }

  setOnPeerLeft(callback: (peerId: string) => void): void {
    this.onPeerLeft = callback;
  }

  setOnFilesUpdated(callback: (files: VenueSharedFile[]) => void): void {
    this.onFilesUpdated = callback;
    // Immediately call with existing files if any
    if (this.sharedFiles.size > 0) {
      console.log('[VenueLan] Calling onFilesUpdated immediately with', this.sharedFiles.size, 'existing files');
      callback(Array.from(this.sharedFiles.values()));
    }
  }

  setOnDisconnected(callback: () => void): void {
    this.onDisconnected = callback;
  }

  setOnError(callback: (error: string) => void): void {
    this.onError = callback;
  }

  // ============================================================================
  // CONNECTION
  // ============================================================================

  /**
   * Connect directly to a WebSocket URL (used for hotspot mode where we know the IP)
   */
  async connectToUrl(wsUrl: string): Promise<void> {
    if (this.ws) {
      await this.disconnect();
    }

    this.connectionState = VenueConnectionState.CONNECTING;
    this.onConnectionStateChange?.(this.connectionState);
    
    // Parse host and port from URL
    const match = wsUrl.match(/ws:\/\/([^:]+):(\d+)/);
    if (match) {
      this.currentHost = {
        host: match[1],
        port: parseInt(match[2], 10),
        name: 'Hotspot Host',
        txt: {
          v: '1',
          room: 'Hotspot Room',
          relay: '1',
          lock: '0',
        },
        fullName: 'Hotspot Host._audiowallet._tcp.local.',
        discoveredAt: Date.now(),
      };
    }

    return new Promise((resolve, reject) => {
      console.log('[VenueLan] Connecting to URL:', wsUrl);

      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.disconnect();
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[VenueLan] WebSocket connected via URL');
        this.connectionState = VenueConnectionState.CONNECTED;
        this.onConnectionStateChange?.(this.connectionState);
        this.reconnectAttempts = 0;
        
        this.send({
          type: VenueMessageType.HELLO,
          peerId: this.localPeerId,
          deviceName: this.displayName,
          platform: Platform.OS,
          appVersion: '1.0.0',
          ts: Date.now(),
        });
        
        this.startHeartbeat();
        resolve();
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log('[VenueLan] WebSocket closed:', event.code);
        this.handleDisconnect();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('[VenueLan] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };
    });
  }

  async connectToVenueHost(host: DiscoveredVenueHost): Promise<void> {
    // Don't reconnect if already connected to the same host
    if (this.ws && this.currentHost && 
        this.currentHost.host === host.host && 
        this.currentHost.port === host.port &&
        this.connectionState === VenueConnectionState.CONNECTED) {
      console.log('[VenueLan] Already connected to this host, skipping reconnect');
      return;
    }
    
    if (this.ws) {
      await this.disconnect();
    }

    this.connectionState = VenueConnectionState.CONNECTING;
    this.onConnectionStateChange?.(this.connectionState);
    this.currentHost = host;

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${host.host}:${host.port}`;
      console.log('[VenueLan] ==========================================');
      console.log('[VenueLan] Attempting WebSocket connection');
      console.log('[VenueLan] URL:', wsUrl);
      console.log('[VenueLan] Host:', host.name);
      console.log('[VenueLan] IP:', host.host, '| Port:', host.port);
      console.log('[VenueLan] ==========================================');
      console.log('[VenueLan] If fails, check: AP Isolation on router, Firewall, IP correctness');

      const timeout = setTimeout(() => {
        console.error('[VenueLan] Connection timeout after 10s to:', wsUrl);
        reject(new Error(`Connection timeout to ${wsUrl}`));
        this.disconnect();
      }, 10000);

      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer'; // Required for receiving binary chunks

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[VenueLan] WebSocket connected successfully to:', wsUrl);
        this.connectionState = VenueConnectionState.CONNECTED;
        this.onConnectionStateChange?.(this.connectionState);
        this.reconnectAttempts = 0;
        
        // Send HELLO
        this.send({
          type: VenueMessageType.HELLO,
          peerId: this.localPeerId,
          deviceName: this.displayName,
          platform: Platform.OS,
          appVersion: '1.0.0',
          ts: Date.now(),
        });
        
        // Start heartbeat
        this.startHeartbeat();
        
        resolve();
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log('[VenueLan] WebSocket closed:', event.code, 'reason:', event.reason || 'none');
        this.handleDisconnect();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('[VenueLan] ==========================================');
        console.error('[VenueLan] WebSocket connection FAILED to:', wsUrl);
        console.error('[VenueLan] Error:', JSON.stringify(error));
        console.error('[VenueLan] Possible causes:');
        console.error('[VenueLan]   1. Devices not on same Wi-Fi network');
        console.error('[VenueLan]   2. Firewall blocking port', host.port);
        console.error('[VenueLan]   3. Host not running or wrong IP');
        console.error('[VenueLan] ==========================================');
        this.connectionState = VenueConnectionState.DISCONNECTED;
        this.onConnectionStateChange?.(this.connectionState);
        reject(new Error(`WebSocket connection failed to ${wsUrl}`));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connectionState = VenueConnectionState.DISCONNECTED;
    this.onConnectionStateChange?.(this.connectionState);
    this.currentHost = null;
    this.currentRoomId = null;
    this.roomPeers.clear();
    this.sharedFiles.clear();
    this.localFileUris.clear();
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  private handleMessage(event: MessageEvent): void {
    // Check for binary data (file chunks)
    if (event.data instanceof ArrayBuffer) {
      console.log('[VenueLan] Received binary chunk:', event.data.byteLength, 'bytes');
      venueRelay.handleBinaryChunk(event.data);
      return;
    }

    try {
      const message = JSON.parse(event.data);
      this.handleJsonMessage(message);
    } catch (error) {
      console.error('[VenueLan] Failed to parse message:', error);
    }
  }

  private handleJsonMessage(message: any): void {
    const type = message.type as VenueMessageType;

    switch (type) {
      case VenueMessageType.WELCOME:
        this.handleWelcome(message);
        break;

      case VenueMessageType.ROOM_INFO:
        this.handleRoomInfo(message);
        break;

      case VenueMessageType.PEER_JOINED:
        this.handlePeerJoined(message);
        break;

      case VenueMessageType.PEER_LEFT:
        this.handlePeerLeft(message);
        break;

      case VenueMessageType.INDEX_FULL:
      case VenueMessageType.INDEX_UPSERT:
        this.handleFilesUpdate(message);
        break;

      case VenueMessageType.INDEX_REMOVE:
        this.handleFilesRemove(message);
        break;

      case VenueMessageType.TRANSFER_START:
      case VenueMessageType.TRANSFER_PROGRESS:
        // Handled by venueRelay
        break;
        
      case VenueMessageType.TRANSFER_COMPLETE:
        // A download completed
        venueRelay.handleTransferComplete(message.transferId, message.sha256 || '');
        break;
        
      case VenueMessageType.RELAY_PULL:
        // Someone requested a file we own - we need to upload it
        this.handleIncomingRelayPull(message);
        break;
        
      case VenueMessageType.RELAY_ERROR:
        venueRelay.handleTransferError(message.transferId, message.error || 'Unknown error');
        break;

      case VenueMessageType.ERROR:
        console.error('[VenueLan] Server error:', message.code, message.message);
        this.onError?.(message.message || 'Unknown error');
        break;

      default:
        console.log('[VenueLan] Unknown message type:', type);
    }
  }

  private handleWelcome(message: any): void {
    console.log('[VenueLan] Welcome from host:', message.hostName);
    
    // Auto-join the default room
    this.send({
      type: VenueMessageType.JOIN_ROOM,
      ts: Date.now(),
    });
  }

  private handleRoomInfo(message: any): void {
    console.log('[VenueLan] Joined room:', message.roomName, 'locked:', message.locked);
    
    this.currentRoomId = message.roomId;
    
    this.onRoomJoined?.({
      roomId: message.roomId,
      roomName: message.roomName,
      hostId: message.hostId,
      peerCount: message.peerCount,
      locked: message.locked ?? false,
    });
  }

  private handlePeerJoined(message: any): void {
    const peer = message.peer as VenuePeer;
    console.log('[VenueLan] Peer joined:', peer.deviceName);
    
    this.roomPeers.set(peer.peerId, peer);
    this.onPeerJoined?.(peer);
  }

  private handlePeerLeft(message: any): void {
    console.log('[VenueLan] Peer left:', message.peerId);
    this.roomPeers.delete(message.peerId);
    this.onPeerLeft?.(message.peerId);
  }

  private handleFilesUpdate(message: any): void {
    const files = message.files as VenueSharedFile[];
    
    console.log(`[VenueLan] Received ${message.type}:`, files.length, 'files');
    
    if (message.type === VenueMessageType.INDEX_FULL) {
      this.sharedFiles.clear();
    }
    
    for (const file of files) {
      console.log('[VenueLan] File:', file.title, 'from', file.ownerName);
      this.sharedFiles.set(file.id, file);
    }
    
    console.log('[VenueLan] Total shared files:', this.sharedFiles.size);
    this.onFilesUpdated?.(Array.from(this.sharedFiles.values()));
  }

  private handleFilesRemove(message: any): void {
    const fileIds = message.fileIds as string[];
    
    for (const id of fileIds) {
      this.sharedFiles.delete(id);
    }
    
    this.onFilesUpdated?.(Array.from(this.sharedFiles.values()));
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    
    const previousHost = this.currentHost;
    
    this.connectionState = VenueConnectionState.DISCONNECTED;
    this.onConnectionStateChange?.(this.connectionState);
    this.roomPeers.clear();
    this.sharedFiles.clear();
    this.currentRoomId = null;
    this.ws = null;
    
    // Try to auto-reconnect if we had a host
    if (previousHost && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[VenueLan] Attempting auto-reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(async () => {
        try {
          await this.connectToVenueHost(previousHost);
          console.log('[VenueLan] Auto-reconnect successful');
        } catch (error) {
          console.error('[VenueLan] Auto-reconnect failed:', error);
          // If all retries exhausted, notify disconnect
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.currentHost = null;
            this.onDisconnected?.();
          }
        }
      }, 2000 * this.reconnectAttempts); // Exponential backoff: 2s, 4s, 6s
    } else {
      // No host or max retries reached
      this.currentHost = null;
      console.log('[VenueLan] Disconnected from host');
      this.onDisconnected?.();
    }
  }

  /**
   * Handle incoming relay pull request - someone wants a file we own
   */
  private async handleIncomingRelayPull(message: any): Promise<void> {
    const { fileId, transferId } = message;
    
    console.log('[VenueLan] Received RELAY_PULL for file:', fileId, 'transfer:', transferId);
    
    // Find the file in our local files
    const localFile = this.localFileUris.get(fileId);
    if (!localFile) {
      console.error('[VenueLan] File not found locally:', fileId);
      this.send({
        type: VenueMessageType.RELAY_ERROR,
        transferId,
        error: 'File not found locally',
        ts: Date.now(),
      });
      return;
    }
    
    // Upload the file via relay
    console.log('[VenueLan] Starting upload for relay:', localFile.uri);
    
    try {
      await venueRelay.uploadFile(
        this.ws!,
        transferId,
        fileId,
        localFile.uri,
        {
          size: localFile.size,
          mimeType: localFile.mimeType,
          sha256: '', // TODO: Calculate hash
        },
        (progress) => {
          console.log('[VenueLan] Upload progress:', progress.progress, '%');
        }
      );
      
      console.log('[VenueLan] Upload complete for relay');
    } catch (error: any) {
      console.error('[VenueLan] Upload failed:', error);
    }
  }

  // ============================================================================
  // FILE SHARING
  // ============================================================================

  shareFiles(files: VenueSharedFile[]): void {
    console.log('[VenueLan] Sharing files:', files.length, files.map(f => f.title));
    this.send({
      type: VenueMessageType.SHARE_FILES,
      files,
      ts: Date.now(),
    });
  }
  
  /**
   * Share files with local URIs so we can upload them when requested
   */
  shareFilesWithLocalUri(files: Array<VenueSharedFile & { localUri: string }>): void {
    console.log('[VenueLan] Sharing files with local URIs:', files.length, files.map(f => f.title));
    
    // Store local file info for later uploads
    for (const file of files) {
      this.localFileUris.set(file.id, {
        uri: file.localUri,
        size: file.size,
        mimeType: file.mimeType,
      });
    }
    
    // Send to venue host (without localUri)
    this.send({
      type: VenueMessageType.SHARE_FILES,
      files: files.map(({ localUri, ...rest }) => rest),
      ts: Date.now(),
    });
  }

  unshareFiles(fileIds: string[]): void {
    this.send({
      type: VenueMessageType.UNSHARE_FILES,
      fileIds,
      ts: Date.now(),
    });
  }

  requestFile(fileId: string, ownerPeerId: string): void {
    this.send({
      type: VenueMessageType.REQUEST_FILE,
      fileId,
      ownerPeerId,
      ts: Date.now(),
    });
  }

  /**
   * Request to download a file via relay
   */
  requestFileRelay(fileId: string): string {
    const transferId = `transfer-${nanoid(10)}`;
    
    this.send({
      type: VenueMessageType.RELAY_PULL,
      fileId,
      transferId,
      ts: Date.now(),
    });
    
    return transferId;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getConnectionState(): VenueConnectionState {
    return this.connectionState;
  }

  isConnectedToVenue(): boolean {
    return this.connectionState === VenueConnectionState.CONNECTED;
  }

  getCurrentHost(): DiscoveredVenueHost | null {
    return this.currentHost;
  }

  getSharedFiles(): VenueSharedFile[] {
    return Array.from(this.sharedFiles.values());
  }

  getRoomPeers(): VenuePeer[] {
    return Array.from(this.roomPeers.values());
  }

  getWebSocket(): WebSocket | null {
    return this.ws;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: VenueMessageType.HEARTBEAT,
        ts: Date.now(),
      });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Export singleton
export const venueLanTransport = new VenueLanTransport();
export default venueLanTransport;

