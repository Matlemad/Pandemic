/**
 * P2P Room Service — High-level room management using P2P transport
 * 
 * Orchestrates:
 * - Room creation and hosting
 * - Room discovery and joining
 * - Peer management
 * - File sharing coordination
 */

import { p2pTransport } from '../index';
import {
  PeerId,
  RoomId,
  RoomAdvertisement,
  DiscoveredRoom,
  ConnectedPeer,
  P2PEventType,
  P2PConfig,
  ConnectionStrategy,
  FileTransferMeta,
  TransferProgress,
  ReceivedBytes,
  ReceivedFile,
} from '../types';
import {
  RoomMessage,
  RoomMessageType,
  SharedFile,
  RoomPeer,
  createHelloMessage,
  createRoomInfoMessage,
  createPeerJoinedMessage,
  createPeerLeftMessage,
  createIndexFullMessage,
  createIndexUpsertMessage,
  createIndexRemoveMessage,
  createFileRequestMessage,
  createFileAcceptMessage,
  createFileRejectMessage,
  createPingMessage,
  createPongMessage,
} from './types';
import {
  encodeMessage,
  decodeMessage,
  ROOM_MESSAGE_TAG,
  MessageHandlerMap,
  processMessage,
} from './codec';
import { generateId } from '../../utils/id';

// ============================================================================
// TYPES
// ============================================================================

export enum RoomRole {
  HOST = 'host',
  GUEST = 'guest',
}

export interface RoomState {
  roomId: RoomId;
  roomName: string;
  role: RoomRole;
  hostPeerId: PeerId;
  hostName: string;
  createdAt: number;
  peers: RoomPeer[];
  sharedFiles: SharedFile[];
}

export interface P2PRoomServiceCallbacks {
  onRoomCreated?: (room: RoomState) => void;
  onRoomJoined?: (room: RoomState) => void;
  onRoomLeft?: () => void;
  onPeerJoined?: (peer: RoomPeer) => void;
  onPeerLeft?: (peerId: PeerId) => void;
  onFilesUpdated?: (files: SharedFile[]) => void;
  onFileRequest?: (fileId: string, fromPeerId: PeerId) => void;
  onTransferProgress?: (progress: TransferProgress) => void;
  onFileReceived?: (file: ReceivedFile) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// P2P ROOM SERVICE
// ============================================================================

class P2PRoomService {
  private isInitialized = false;
  private localPeerId: PeerId = '';
  private displayName: string = 'Pandemic User';
  
  private currentRoom: RoomState | null = null;
  private callbacks: P2PRoomServiceCallbacks = {};
  
  // Host-only state
  private pendingFileRequests: Map<string, { fileId: string; fromPeerId: PeerId }> = new Map();
  
  // File index (authoritative on host, synced on guests)
  private fileIndex: Map<string, SharedFile> = new Map();
  
  // My shared files (subset of fileIndex owned by me)
  private mySharedFiles: Map<string, SharedFile> = new Map();
  
  // Track file paths for sending
  private filePathMap: Map<string, string> = new Map();
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  async initialize(displayName: string): Promise<boolean> {
    if (this.isInitialized) return true;
    
    try {
      this.displayName = displayName;
      
      const config: P2PConfig = {
        serviceId: 'com.pandemic.p2p',
        displayName,
        strategy: ConnectionStrategy.STAR,
      };
      
      await p2pTransport.initialize(config);
      this.localPeerId = p2pTransport.getLocalPeerId();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('[P2PRoomService] Initialized with peerId:', this.localPeerId);
      return true;
    } catch (error) {
      console.error('[P2PRoomService] Initialization failed:', error);
      return false;
    }
  }
  
  async destroy(): Promise<void> {
    await this.leaveRoom();
    await p2pTransport.destroy();
    this.isInitialized = false;
    this.currentRoom = null;
    this.fileIndex.clear();
    this.mySharedFiles.clear();
    console.log('[P2PRoomService] Destroyed');
  }
  
  setCallbacks(callbacks: P2PRoomServiceCallbacks): void {
    this.callbacks = callbacks;
  }
  
  private setupEventListeners(): void {
    // Listen for incoming messages
    p2pTransport.on(P2PEventType.BYTES_RECEIVED, this.handleBytesReceived.bind(this));
    
    // Listen for peer events
    p2pTransport.on(P2PEventType.PEER_CONNECTED, this.handlePeerConnected.bind(this));
    p2pTransport.on(P2PEventType.PEER_DISCONNECTED, this.handlePeerDisconnected.bind(this));
    
    // Listen for file events
    p2pTransport.on(P2PEventType.FILE_RECEIVED, this.handleFileReceived.bind(this));
    p2pTransport.on(P2PEventType.TRANSFER_PROGRESS, this.handleTransferProgress.bind(this));
  }
  
  // ============================================================================
  // ROOM MANAGEMENT
  // ============================================================================
  
  /**
   * Create and host a new room
   */
  async createRoom(roomName: string): Promise<RoomState | null> {
    if (!this.isInitialized) {
      console.error('[P2PRoomService] Not initialized');
      return null;
    }
    
    if (this.currentRoom) {
      console.warn('[P2PRoomService] Already in a room');
      return this.currentRoom;
    }
    
    try {
      const roomId = generateId();
      const createdAt = Date.now();
      
      const advertisement: RoomAdvertisement = {
        roomId,
        roomName,
        hostPeerId: this.localPeerId,
        hostName: this.displayName,
        peerCount: 0,
        createdAt,
      };
      
      await p2pTransport.startAdvertising(advertisement);
      
      this.currentRoom = {
        roomId,
        roomName,
        role: RoomRole.HOST,
        hostPeerId: this.localPeerId,
        hostName: this.displayName,
        createdAt,
        peers: [],
        sharedFiles: [],
      };
      
      this.fileIndex.clear();
      this.callbacks.onRoomCreated?.(this.currentRoom);
      
      console.log('[P2PRoomService] Room created:', roomName);
      return this.currentRoom;
    } catch (error) {
      console.error('[P2PRoomService] Failed to create room:', error);
      this.callbacks.onError?.(`Failed to create room: ${error}`);
      return null;
    }
  }
  
  /**
   * Start scanning for nearby rooms
   */
  async startScanning(): Promise<void> {
    if (!this.isInitialized) return;
    await p2pTransport.startDiscovery();
  }
  
  /**
   * Stop scanning for rooms
   */
  async stopScanning(): Promise<void> {
    await p2pTransport.stopDiscovery();
  }
  
  /**
   * Get discovered rooms
   */
  getDiscoveredRooms(): DiscoveredRoom[] {
    return p2pTransport.getDiscoveredRooms();
  }
  
  /**
   * Join an existing room
   */
  async joinRoom(room: DiscoveredRoom): Promise<boolean> {
    if (!this.isInitialized) {
      console.error('[P2PRoomService] Not initialized');
      return false;
    }
    
    if (this.currentRoom) {
      console.warn('[P2PRoomService] Already in a room');
      return false;
    }
    
    try {
      await p2pTransport.stopDiscovery();
      await p2pTransport.connectToHost(room.hostPeerId);
      
      // Room state will be set when we receive ROOM_INFO from host
      this.currentRoom = {
        roomId: room.roomId,
        roomName: room.roomName,
        role: RoomRole.GUEST,
        hostPeerId: room.hostPeerId,
        hostName: room.hostName,
        createdAt: room.createdAt,
        peers: [],
        sharedFiles: [],
      };
      
      // Send HELLO message
      const hello = createHelloMessage(this.localPeerId, this.displayName);
      await this.sendToHost(hello);
      
      console.log('[P2PRoomService] Joined room:', room.roomName);
      return true;
    } catch (error) {
      console.error('[P2PRoomService] Failed to join room:', error);
      this.currentRoom = null;
      this.callbacks.onError?.(`Failed to join room: ${error}`);
      return false;
    }
  }
  
  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    if (!this.currentRoom) return;
    
    if (this.currentRoom.role === RoomRole.HOST) {
      await p2pTransport.stopAdvertising();
    }
    
    await p2pTransport.disconnectAll();
    
    this.currentRoom = null;
    this.fileIndex.clear();
    this.mySharedFiles.clear();
    this.pendingFileRequests.clear();
    
    this.callbacks.onRoomLeft?.();
    console.log('[P2PRoomService] Left room');
  }
  
  /**
   * Get current room state
   */
  getCurrentRoom(): RoomState | null {
    return this.currentRoom;
  }
  
  /**
   * Check if in a room
   */
  isInRoom(): boolean {
    return this.currentRoom !== null;
  }
  
  /**
   * Check if hosting
   */
  isHosting(): boolean {
    return this.currentRoom?.role === RoomRole.HOST;
  }
  
  // ============================================================================
  // FILE SHARING
  // ============================================================================
  
  /**
   * Share a file in the room
   */
  async shareFile(file: SharedFile, localPath: string): Promise<void> {
    if (!this.currentRoom) return;
    
    // Store the file
    this.mySharedFiles.set(file.id, file);
    this.filePathMap.set(file.id, localPath);
    
    if (this.currentRoom.role === RoomRole.HOST) {
      // Host: add directly to index and broadcast
      this.fileIndex.set(file.id, file);
      await this.broadcastIndexUpsert([file]);
    } else {
      // Guest: send to host for indexing
      const upsert = createIndexUpsertMessage(this.localPeerId, [file]);
      await this.sendToHost(upsert);
    }
    
    this.updateSharedFilesCallback();
    console.log('[P2PRoomService] Shared file:', file.title);
  }
  
  /**
   * Unshare a file
   */
  async unshareFile(fileId: string): Promise<void> {
    if (!this.currentRoom) return;
    
    this.mySharedFiles.delete(fileId);
    this.filePathMap.delete(fileId);
    
    if (this.currentRoom.role === RoomRole.HOST) {
      // Host: remove from index and broadcast
      this.fileIndex.delete(fileId);
      await this.broadcastIndexRemove([fileId]);
    } else {
      // Guest: send to host
      const remove = createIndexRemoveMessage(this.localPeerId, [fileId]);
      await this.sendToHost(remove);
    }
    
    this.updateSharedFilesCallback();
    console.log('[P2PRoomService] Unshared file:', fileId);
  }
  
  /**
   * Get all shared files in the room
   */
  getSharedFiles(): SharedFile[] {
    return Array.from(this.fileIndex.values());
  }
  
  /**
   * Get my shared files
   */
  getMySharedFiles(): SharedFile[] {
    return Array.from(this.mySharedFiles.values());
  }
  
  /**
   * Request to download a file
   */
  async requestFile(fileId: string): Promise<void> {
    if (!this.currentRoom) return;
    
    const file = this.fileIndex.get(fileId);
    if (!file) {
      console.error('[P2PRoomService] File not found:', fileId);
      return;
    }
    
    // Send request to host (host will forward to owner)
    const request = createFileRequestMessage(this.localPeerId, fileId, this.localPeerId);
    await this.sendToHost(request);
    
    console.log('[P2PRoomService] Requested file:', file.title);
  }
  
  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  
  private async handleBytesReceived(received: ReceivedBytes): Promise<void> {
    if (received.typeTag !== ROOM_MESSAGE_TAG) return;
    
    const message = decodeMessage(received.data);
    if (!message) return;
    
    const handlers: MessageHandlerMap = {
      [RoomMessageType.HELLO]: this.handleHello.bind(this),
      [RoomMessageType.ROOM_INFO]: this.handleRoomInfo.bind(this),
      [RoomMessageType.PEER_JOINED]: this.handlePeerJoinedMessage.bind(this),
      [RoomMessageType.PEER_LEFT]: this.handlePeerLeftMessage.bind(this),
      [RoomMessageType.INDEX_FULL]: this.handleIndexFull.bind(this),
      [RoomMessageType.INDEX_UPSERT]: this.handleIndexUpsert.bind(this),
      [RoomMessageType.INDEX_REMOVE]: this.handleIndexRemove.bind(this),
      [RoomMessageType.FILE_REQUEST]: this.handleFileRequest.bind(this),
      [RoomMessageType.FILE_ACCEPT]: this.handleFileAccept.bind(this),
      [RoomMessageType.FILE_REJECT]: this.handleFileReject.bind(this),
      [RoomMessageType.PING]: this.handlePing.bind(this),
      [RoomMessageType.PONG]: this.handlePong.bind(this),
    };
    
    await processMessage(message, handlers);
  }
  
  private async handleHello(message: RoomMessage & { type: RoomMessageType.HELLO }): Promise<void> {
    if (!this.currentRoom || this.currentRoom.role !== RoomRole.HOST) return;
    
    console.log('[P2PRoomService] Received HELLO from:', message.peerName);
    
    // Add peer to room
    const newPeer: RoomPeer = {
      peerId: message.senderId,
      displayName: message.peerName,
      joinedAt: Date.now(),
      sharedFileCount: 0,
    };
    
    this.currentRoom.peers.push(newPeer);
    
    // Send ROOM_INFO
    const roomInfo = createRoomInfoMessage(
      this.localPeerId,
      this.currentRoom.roomId,
      this.currentRoom.roomName,
      this.currentRoom.hostPeerId,
      this.currentRoom.hostName,
      this.currentRoom.createdAt
    );
    await this.sendToPeer(message.senderId, roomInfo);
    
    // Send INDEX_FULL
    const indexFull = createIndexFullMessage(
      this.localPeerId,
      Array.from(this.fileIndex.values())
    );
    await this.sendToPeer(message.senderId, indexFull);
    
    // Broadcast PEER_JOINED to all peers
    const peerJoined = createPeerJoinedMessage(this.localPeerId, newPeer);
    await this.broadcastMessage(peerJoined, [message.senderId]);
    
    this.callbacks.onPeerJoined?.(newPeer);
  }
  
  private handleRoomInfo(message: RoomMessage & { type: RoomMessageType.ROOM_INFO }): void {
    if (!this.currentRoom || this.currentRoom.role !== RoomRole.GUEST) return;
    
    console.log('[P2PRoomService] Received ROOM_INFO');
    
    // Update room info from host
    this.currentRoom.roomId = message.roomId;
    this.currentRoom.roomName = message.roomName;
    this.currentRoom.hostPeerId = message.hostPeerId;
    this.currentRoom.hostName = message.hostName;
    this.currentRoom.createdAt = message.createdAt;
    
    this.callbacks.onRoomJoined?.(this.currentRoom);
  }
  
  private handlePeerJoinedMessage(message: RoomMessage & { type: RoomMessageType.PEER_JOINED }): void {
    if (!this.currentRoom) return;
    
    console.log('[P2PRoomService] Peer joined:', message.peer.displayName);
    this.currentRoom.peers.push(message.peer);
    this.callbacks.onPeerJoined?.(message.peer);
  }
  
  private handlePeerLeftMessage(message: RoomMessage & { type: RoomMessageType.PEER_LEFT }): void {
    if (!this.currentRoom) return;
    
    console.log('[P2PRoomService] Peer left:', message.peerId);
    this.currentRoom.peers = this.currentRoom.peers.filter(p => p.peerId !== message.peerId);
    this.callbacks.onPeerLeft?.(message.peerId);
  }
  
  private handleIndexFull(message: RoomMessage & { type: RoomMessageType.INDEX_FULL }): void {
    console.log('[P2PRoomService] Received INDEX_FULL with', message.files.length, 'files');
    
    this.fileIndex.clear();
    for (const file of message.files) {
      this.fileIndex.set(file.id, file);
    }
    
    this.updateSharedFilesCallback();
  }
  
  private async handleIndexUpsert(message: RoomMessage & { type: RoomMessageType.INDEX_UPSERT }): Promise<void> {
    console.log('[P2PRoomService] Received INDEX_UPSERT with', message.files.length, 'files');
    
    for (const file of message.files) {
      this.fileIndex.set(file.id, file);
    }
    
    // If host, broadcast to all other peers
    if (this.currentRoom?.role === RoomRole.HOST) {
      await this.broadcastMessage(message, [message.senderId]);
    }
    
    this.updateSharedFilesCallback();
  }
  
  private async handleIndexRemove(message: RoomMessage & { type: RoomMessageType.INDEX_REMOVE }): Promise<void> {
    console.log('[P2PRoomService] Received INDEX_REMOVE:', message.fileIds);
    
    for (const fileId of message.fileIds) {
      this.fileIndex.delete(fileId);
    }
    
    // If host, broadcast to all other peers
    if (this.currentRoom?.role === RoomRole.HOST) {
      await this.broadcastMessage(message, [message.senderId]);
    }
    
    this.updateSharedFilesCallback();
  }
  
  private async handleFileRequest(message: RoomMessage & { type: RoomMessageType.FILE_REQUEST }): Promise<void> {
    console.log('[P2PRoomService] Received FILE_REQUEST:', message.fileId);
    
    const file = this.fileIndex.get(message.fileId);
    if (!file) {
      console.warn('[P2PRoomService] File not found:', message.fileId);
      return;
    }
    
    if (this.currentRoom?.role === RoomRole.HOST) {
      // Forward request to file owner
      if (file.ownerPeerId === this.localPeerId) {
        // I own this file, handle directly
        await this.respondToFileRequest(message.fileId, message.fromPeerId);
      } else {
        // Forward to owner
        await this.sendToPeer(file.ownerPeerId, message);
      }
    } else {
      // I'm a guest and own this file
      if (file.ownerPeerId === this.localPeerId) {
        await this.respondToFileRequest(message.fileId, message.fromPeerId);
      }
    }
    
    this.callbacks.onFileRequest?.(message.fileId, message.fromPeerId);
  }
  
  private async respondToFileRequest(fileId: string, toPeerId: PeerId): Promise<void> {
    const localPath = this.filePathMap.get(fileId);
    const file = this.mySharedFiles.get(fileId);
    
    if (!localPath || !file) {
      // Reject
      const reject = createFileRejectMessage(
        this.localPeerId,
        fileId,
        toPeerId,
        'File not available'
      );
      await this.sendToPeer(toPeerId, reject);
      return;
    }
    
    // Accept and start transfer
    const transferMeta: FileTransferMeta = {
      fileId: file.id,
      fileName: file.title,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      sha256: file.sha256,
    };
    
    const accept = createFileAcceptMessage(
      this.localPeerId,
      fileId,
      toPeerId,
      transferMeta
    );
    await this.sendToPeer(toPeerId, accept);
    
    // Start file transfer
    await p2pTransport.sendFile(toPeerId, localPath, transferMeta);
  }
  
  private handleFileAccept(message: RoomMessage & { type: RoomMessageType.FILE_ACCEPT }): void {
    console.log('[P2PRoomService] File accepted:', message.fileId);
    // File transfer will be handled by transport layer
  }
  
  private handleFileReject(message: RoomMessage & { type: RoomMessageType.FILE_REJECT }): void {
    console.log('[P2PRoomService] File rejected:', message.fileId, message.reason);
    this.callbacks.onError?.(`File request rejected: ${message.reason}`);
  }
  
  private async handlePing(message: RoomMessage & { type: RoomMessageType.PING }): Promise<void> {
    const pong = createPongMessage(this.localPeerId);
    await this.sendToPeer(message.senderId, pong);
  }
  
  private handlePong(_message: RoomMessage & { type: RoomMessageType.PONG }): void {
    // Heartbeat received
  }
  
  // ============================================================================
  // P2P EVENT HANDLERS
  // ============================================================================
  
  private handlePeerConnected(peer: ConnectedPeer): void {
    console.log('[P2PRoomService] Peer connected:', peer.displayName);
  }
  
  private async handlePeerDisconnected(data: { peerId: PeerId }): Promise<void> {
    console.log('[P2PRoomService] Peer disconnected:', data.peerId);
    
    if (!this.currentRoom) return;
    
    // Remove peer from room
    const peerIndex = this.currentRoom.peers.findIndex(p => p.peerId === data.peerId);
    if (peerIndex >= 0) {
      const peer = this.currentRoom.peers[peerIndex];
      this.currentRoom.peers.splice(peerIndex, 1);
      
      // If host, broadcast peer left
      if (this.currentRoom.role === RoomRole.HOST) {
        const peerLeft = createPeerLeftMessage(this.localPeerId, data.peerId);
        await this.broadcastMessage(peerLeft);
        
        // Remove their files from index
        const filesToRemove: string[] = [];
        for (const [fileId, file] of this.fileIndex) {
          if (file.ownerPeerId === data.peerId) {
            filesToRemove.push(fileId);
          }
        }
        
        if (filesToRemove.length > 0) {
          for (const fileId of filesToRemove) {
            this.fileIndex.delete(fileId);
          }
          await this.broadcastIndexRemove(filesToRemove);
          this.updateSharedFilesCallback();
        }
      }
      
      this.callbacks.onPeerLeft?.(data.peerId);
    }
    
    // If host disconnected, leave room
    if (this.currentRoom.role === RoomRole.GUEST && data.peerId === this.currentRoom.hostPeerId) {
      console.log('[P2PRoomService] Host disconnected, leaving room');
      await this.leaveRoom();
    }
  }
  
  private handleFileReceived(file: ReceivedFile): void {
    console.log('[P2PRoomService] File received:', file.meta.fileName);
    this.callbacks.onFileReceived?.(file);
  }
  
  private handleTransferProgress(progress: TransferProgress): void {
    this.callbacks.onTransferProgress?.(progress);
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  private async sendToHost(message: RoomMessage): Promise<void> {
    if (!this.currentRoom) return;
    
    const data = encodeMessage(message);
    await p2pTransport.sendBytes(this.currentRoom.hostPeerId, data, ROOM_MESSAGE_TAG);
  }
  
  private async sendToPeer(peerId: PeerId, message: RoomMessage): Promise<void> {
    const data = encodeMessage(message);
    await p2pTransport.sendBytes(peerId, data, ROOM_MESSAGE_TAG);
  }
  
  private async broadcastMessage(message: RoomMessage, excludePeers: PeerId[] = []): Promise<void> {
    const data = encodeMessage(message);
    const peers = p2pTransport.getConnectedPeers();
    
    for (const peer of peers) {
      if (!excludePeers.includes(peer.peerId)) {
        await p2pTransport.sendBytes(peer.peerId, data, ROOM_MESSAGE_TAG);
      }
    }
  }
  
  private async broadcastIndexUpsert(files: SharedFile[]): Promise<void> {
    const upsert = createIndexUpsertMessage(this.localPeerId, files);
    await this.broadcastMessage(upsert);
  }
  
  private async broadcastIndexRemove(fileIds: string[]): Promise<void> {
    const remove = createIndexRemoveMessage(this.localPeerId, fileIds);
    await this.broadcastMessage(remove);
  }
  
  private updateSharedFilesCallback(): void {
    const files = this.getSharedFiles();
    this.callbacks.onFilesUpdated?.(files);
    
    if (this.currentRoom) {
      this.currentRoom.sharedFiles = files;
    }
  }
}

// Export singleton instance
export const p2pRoomService = new P2PRoomService();
export default p2pRoomService;

