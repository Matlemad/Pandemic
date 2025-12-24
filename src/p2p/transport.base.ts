/**
 * P2P Transport Interface — Abstract interface for P2P communication
 * 
 * This interface defines the contract that platform-specific implementations
 * must fulfill:
 * - Android: Google Nearby Connections API
 * - iOS: Apple MultipeerConnectivity
 */

import {
  PeerId,
  RoomId,
  TransferId,
  RoomAdvertisement,
  DiscoveredRoom,
  ConnectedPeer,
  FileTransferMeta,
  TransferProgress,
  P2PConfig,
  P2PError,
  P2PErrorCode,
  P2PEventType,
  P2PEventCallback,
} from './types';
import { p2pEvents } from './events';

/**
 * Abstract P2P Transport interface
 * 
 * Implementations must provide platform-specific functionality for:
 * - Discovery (finding nearby rooms)
 * - Advertising (making a room discoverable)
 * - Connection management
 * - Data transfer (bytes and files)
 */
export interface IP2PTransport {
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize the P2P transport layer
   * @param config Configuration options
   */
  initialize(config: P2PConfig): Promise<void>;
  
  /**
   * Cleanup and release resources
   */
  destroy(): Promise<void>;
  
  /**
   * Check if P2P is available on this device
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Request necessary permissions
   * @returns true if all permissions granted
   */
  requestPermissions(): Promise<boolean>;
  
  // ============================================================================
  // IDENTITY
  // ============================================================================
  
  /**
   * Get the local peer ID
   */
  getLocalPeerId(): PeerId;
  
  /**
   * Set the display name for this device
   */
  setDisplayName(name: string): void;
  
  /**
   * Get the current display name
   */
  getDisplayName(): string;
  
  // ============================================================================
  // DISCOVERY (Guest mode)
  // ============================================================================
  
  /**
   * Start discovering nearby rooms
   * Emits: ROOM_FOUND, ROOM_LOST, DISCOVERY_STARTED, DISCOVERY_STOPPED
   */
  startDiscovery(): Promise<void>;
  
  /**
   * Stop discovering rooms
   */
  stopDiscovery(): Promise<void>;
  
  /**
   * Check if currently discovering
   */
  isDiscovering(): boolean;
  
  /**
   * Get list of currently discovered rooms
   */
  getDiscoveredRooms(): DiscoveredRoom[];
  
  // ============================================================================
  // ADVERTISING (Host mode)
  // ============================================================================
  
  /**
   * Start advertising a room
   * @param room Room information to advertise
   * Emits: ADVERTISING_STARTED, ADVERTISING_STOPPED
   */
  startAdvertising(room: RoomAdvertisement): Promise<void>;
  
  /**
   * Stop advertising
   */
  stopAdvertising(): Promise<void>;
  
  /**
   * Check if currently advertising
   */
  isAdvertising(): boolean;
  
  // ============================================================================
  // CONNECTION
  // ============================================================================
  
  /**
   * Connect to a host (as guest)
   * @param hostPeerId The peer ID of the host to connect to
   * Emits: PEER_CONNECTING, PEER_CONNECTED, CONNECTION_FAILED
   */
  connectToHost(hostPeerId: PeerId): Promise<void>;
  
  /**
   * Accept an incoming connection request (as host)
   * @param peerId The peer ID requesting connection
   */
  acceptConnection(peerId: PeerId): Promise<void>;
  
  /**
   * Reject an incoming connection request (as host)
   * @param peerId The peer ID requesting connection
   */
  rejectConnection(peerId: PeerId): Promise<void>;
  
  /**
   * Disconnect from a specific peer
   * @param peerId Peer to disconnect from
   * Emits: PEER_DISCONNECTED
   */
  disconnectFromPeer(peerId: PeerId): Promise<void>;
  
  /**
   * Disconnect from all peers
   */
  disconnectAll(): Promise<void>;
  
  /**
   * Get list of connected peers
   */
  getConnectedPeers(): ConnectedPeer[];
  
  /**
   * Check if connected to a specific peer
   */
  isConnectedTo(peerId: PeerId): boolean;
  
  // ============================================================================
  // DATA TRANSFER — BYTES
  // ============================================================================
  
  /**
   * Send bytes payload to a peer
   * @param toPeerId Target peer
   * @param data Data as base64 string
   * @param typeTag Message type tag for routing
   * @returns true if sent successfully
   */
  sendBytes(toPeerId: PeerId, data: string, typeTag: string): Promise<boolean>;
  
  /**
   * Broadcast bytes to all connected peers
   * @param data Data as base64 string
   * @param typeTag Message type tag for routing
   */
  broadcastBytes(data: string, typeTag: string): Promise<void>;
  
  // ============================================================================
  // DATA TRANSFER — FILES
  // ============================================================================
  
  /**
   * Send a file to a peer
   * @param toPeerId Target peer
   * @param fileUri Local file URI
   * @param meta File metadata
   * @returns Transfer ID for tracking progress
   * Emits: TRANSFER_PROGRESS
   */
  sendFile(
    toPeerId: PeerId,
    fileUri: string,
    meta: FileTransferMeta
  ): Promise<TransferId>;
  
  /**
   * Cancel an ongoing transfer
   * @param transferId Transfer to cancel
   */
  cancelTransfer(transferId: TransferId): Promise<void>;
  
  /**
   * Get progress of a transfer
   */
  getTransferProgress(transferId: TransferId): TransferProgress | null;
  
  // ============================================================================
  // EVENTS
  // ============================================================================
  
  /**
   * Subscribe to P2P events
   */
  on<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void;
  
  /**
   * Subscribe to P2P event once
   */
  once<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void;
  
  /**
   * Unsubscribe from P2P events
   */
  off<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): void;
}

/**
 * Base P2P Transport class with common functionality
 * 
 * Platform-specific implementations should extend this class.
 */
export abstract class BaseP2PTransport implements IP2PTransport {
  protected config: P2PConfig | null = null;
  protected localPeerId: PeerId = '';
  protected displayName: string = 'Pandemic User';
  protected _isDiscovering: boolean = false;
  protected _isAdvertising: boolean = false;
  protected discoveredRooms: Map<RoomId, DiscoveredRoom> = new Map();
  protected connectedPeers: Map<PeerId, ConnectedPeer> = new Map();
  protected transfers: Map<TransferId, TransferProgress> = new Map();

  // ============================================================================
  // ABSTRACT METHODS (must be implemented by platform-specific classes)
  // ============================================================================
  
  abstract initialize(config: P2PConfig): Promise<void>;
  abstract destroy(): Promise<void>;
  abstract isAvailable(): Promise<boolean>;
  abstract requestPermissions(): Promise<boolean>;
  abstract startDiscovery(): Promise<void>;
  abstract stopDiscovery(): Promise<void>;
  abstract startAdvertising(room: RoomAdvertisement): Promise<void>;
  abstract stopAdvertising(): Promise<void>;
  abstract connectToHost(hostPeerId: PeerId): Promise<void>;
  abstract acceptConnection(peerId: PeerId): Promise<void>;
  abstract rejectConnection(peerId: PeerId): Promise<void>;
  abstract disconnectFromPeer(peerId: PeerId): Promise<void>;
  abstract disconnectAll(): Promise<void>;
  abstract sendBytes(toPeerId: PeerId, data: string, typeTag: string): Promise<boolean>;
  abstract sendFile(toPeerId: PeerId, fileUri: string, meta: FileTransferMeta): Promise<TransferId>;
  abstract cancelTransfer(transferId: TransferId): Promise<void>;

  // ============================================================================
  // COMMON IMPLEMENTATIONS
  // ============================================================================
  
  getLocalPeerId(): PeerId {
    return this.localPeerId;
  }
  
  setDisplayName(name: string): void {
    this.displayName = name;
  }
  
  getDisplayName(): string {
    return this.displayName;
  }
  
  isDiscovering(): boolean {
    return this._isDiscovering;
  }
  
  isAdvertising(): boolean {
    return this._isAdvertising;
  }
  
  getDiscoveredRooms(): DiscoveredRoom[] {
    return Array.from(this.discoveredRooms.values());
  }
  
  getConnectedPeers(): ConnectedPeer[] {
    return Array.from(this.connectedPeers.values());
  }
  
  isConnectedTo(peerId: PeerId): boolean {
    return this.connectedPeers.has(peerId);
  }
  
  async broadcastBytes(data: string, typeTag: string): Promise<void> {
    const peers = this.getConnectedPeers();
    const promises = peers.map((peer) =>
      this.sendBytes(peer.peerId, data, typeTag).catch((error) => {
        console.error(`Failed to send to peer ${peer.peerId}:`, error);
        return false;
      })
    );
    await Promise.all(promises);
  }
  
  getTransferProgress(transferId: TransferId): TransferProgress | null {
    return this.transfers.get(transferId) ?? null;
  }
  
  // ============================================================================
  // EVENT DELEGATION
  // ============================================================================
  
  on<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void {
    return p2pEvents.on(eventType, callback);
  }
  
  once<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void {
    return p2pEvents.once(eventType, callback);
  }
  
  off<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): void {
    p2pEvents.off(eventType, callback);
  }
  
  // ============================================================================
  // HELPER METHODS FOR SUBCLASSES
  // ============================================================================
  
  protected emit<T extends P2PEventType>(
    eventType: T,
    payload: Parameters<typeof p2pEvents.emit<T>>[1]
  ): void {
    p2pEvents.emit(eventType, payload);
  }
  
  protected addDiscoveredRoom(room: DiscoveredRoom): void {
    this.discoveredRooms.set(room.roomId, room);
    this.emit(P2PEventType.ROOM_FOUND, room);
  }
  
  protected removeDiscoveredRoom(roomId: RoomId): void {
    if (this.discoveredRooms.delete(roomId)) {
      this.emit(P2PEventType.ROOM_LOST, { roomId });
    }
  }
  
  protected addConnectedPeer(peer: ConnectedPeer): void {
    this.connectedPeers.set(peer.peerId, peer);
    this.emit(P2PEventType.PEER_CONNECTED, peer);
  }
  
  protected removeConnectedPeer(peerId: PeerId): void {
    if (this.connectedPeers.delete(peerId)) {
      this.emit(P2PEventType.PEER_DISCONNECTED, { peerId });
    }
  }
  
  protected updateTransferProgress(progress: TransferProgress): void {
    this.transfers.set(progress.transferId, progress);
    this.emit(P2PEventType.TRANSFER_PROGRESS, progress);
  }
  
  protected throwError(code: P2PErrorCode, message: string): never {
    throw new P2PError(code, message);
  }
}

/**
 * Mock P2P Transport for testing and development
 * 
 * This implementation simulates P2P behavior without actual native modules.
 */
export class MockP2PTransport extends BaseP2PTransport {
  async initialize(config: P2PConfig): Promise<void> {
    this.config = config;
    this.localPeerId = `mock-${Date.now()}`;
    this.displayName = config.displayName;
    console.log('[MockP2P] Initialized with config:', config);
  }
  
  async destroy(): Promise<void> {
    this.discoveredRooms.clear();
    this.connectedPeers.clear();
    this.transfers.clear();
    console.log('[MockP2P] Destroyed');
  }
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
  
  async requestPermissions(): Promise<boolean> {
    console.log('[MockP2P] Permissions granted (mock)');
    return true;
  }
  
  async startDiscovery(): Promise<void> {
    this._isDiscovering = true;
    this.emit(P2PEventType.DISCOVERY_STARTED, undefined as never);
    console.log('[MockP2P] Discovery started');
  }
  
  async stopDiscovery(): Promise<void> {
    this._isDiscovering = false;
    this.emit(P2PEventType.DISCOVERY_STOPPED, undefined as never);
    console.log('[MockP2P] Discovery stopped');
  }
  
  async startAdvertising(room: RoomAdvertisement): Promise<void> {
    this._isAdvertising = true;
    this.emit(P2PEventType.ADVERTISING_STARTED, undefined as never);
    console.log('[MockP2P] Advertising started:', room.roomName);
  }
  
  async stopAdvertising(): Promise<void> {
    this._isAdvertising = false;
    this.emit(P2PEventType.ADVERTISING_STOPPED, undefined as never);
    console.log('[MockP2P] Advertising stopped');
  }
  
  async connectToHost(hostPeerId: PeerId): Promise<void> {
    this.emit(P2PEventType.PEER_CONNECTING, {
      peerId: hostPeerId,
      displayName: 'Mock Host',
    });
    
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    this.addConnectedPeer({
      peerId: hostPeerId,
      displayName: 'Mock Host',
      connectionState: 'connected' as const,
      connectedAt: Date.now(),
    });
    
    console.log('[MockP2P] Connected to host:', hostPeerId);
  }
  
  async acceptConnection(peerId: PeerId): Promise<void> {
    this.addConnectedPeer({
      peerId,
      displayName: `Guest ${peerId.slice(0, 4)}`,
      connectionState: 'connected' as const,
      connectedAt: Date.now(),
    });
    console.log('[MockP2P] Accepted connection from:', peerId);
  }
  
  async rejectConnection(peerId: PeerId): Promise<void> {
    console.log('[MockP2P] Rejected connection from:', peerId);
  }
  
  async disconnectFromPeer(peerId: PeerId): Promise<void> {
    this.removeConnectedPeer(peerId);
    console.log('[MockP2P] Disconnected from:', peerId);
  }
  
  async disconnectAll(): Promise<void> {
    const peers = Array.from(this.connectedPeers.keys());
    for (const peerId of peers) {
      this.removeConnectedPeer(peerId);
    }
    console.log('[MockP2P] Disconnected from all peers');
  }
  
  async sendBytes(toPeerId: PeerId, data: string, typeTag: string): Promise<boolean> {
    console.log(`[MockP2P] Sending bytes to ${toPeerId}:`, { typeTag, dataLength: data.length });
    return true;
  }
  
  async sendFile(
    toPeerId: PeerId,
    fileUri: string,
    meta: FileTransferMeta
  ): Promise<TransferId> {
    const transferId = `transfer-${Date.now()}`;
    console.log(`[MockP2P] Sending file to ${toPeerId}:`, meta.fileName);
    
    // Simulate transfer progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      this.updateTransferProgress({
        transferId,
        direction: 'outgoing' as const,
        state: progress >= 100 ? 'completed' as const : 'in_progress' as const,
        bytesTransferred: (progress / 100) * meta.sizeBytes,
        totalBytes: meta.sizeBytes,
        progress,
        speed: 500000, // 500KB/s mock speed
        eta: ((100 - progress) / 10) * 0.5,
      });
      
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 500);
    
    return transferId;
  }
  
  async cancelTransfer(transferId: TransferId): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      this.updateTransferProgress({
        ...transfer,
        state: 'cancelled' as const,
      });
    }
    console.log('[MockP2P] Transfer cancelled:', transferId);
  }
}

