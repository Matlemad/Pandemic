/**
 * Room Manager — Manages rooms, peers, and file index
 */

import { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import {
  VenuePeer,
  VenueRoom,
  SharedFileMeta,
  RelayTransfer,
  VenueHostConfig,
  DEFAULT_CONFIG,
} from './types.js';

export class RoomManager {
  private config: VenueHostConfig;
  
  // Peer connections
  private peers: Map<string, VenuePeer> = new Map();
  private peerConnections: Map<string, WebSocket> = new Map();
  
  // Rooms
  private rooms: Map<string, VenueRoom> = new Map();
  private defaultRoomId: string;
  
  // Active transfers
  private transfers: Map<string, RelayTransfer> = new Map();
  
  // Host files (from venue host dashboard)
  private hostFiles: Map<string, SharedFileMeta> = new Map();
  
  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<VenueHostConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Create default room
    this.defaultRoomId = nanoid(10);
    this.rooms.set(this.defaultRoomId, {
      roomId: this.defaultRoomId,
      roomName: this.config.roomName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Start cleanup interval
    this.startCleanup();
  }
  
  // ============================================================================
  // HOST FILES
  // ============================================================================
  
  setHostFiles(files: Array<{ id: string; title: string; artist?: string; fileName: string; size: number; mimeType: string; sha256: string; pathOnDisk: string }>): void {
    this.hostFiles.clear();
    for (const f of files) {
      this.hostFiles.set(f.id, {
        id: f.id,
        title: f.title,
        artist: f.artist,
        album: undefined,
        duration: undefined,
        size: f.size,
        mimeType: f.mimeType,
        sha256: f.sha256,
        ownerPeerId: 'venue-host',
        ownerName: 'Venue Host',
        addedAt: Date.now(),
        // Store path for relay
        pathOnDisk: f.pathOnDisk,
      } as SharedFileMeta & { pathOnDisk: string });
    }
    console.log(`[RoomManager] Host files updated: ${files.length} files`);
  }
  
  getHostFile(fileId: string): (SharedFileMeta & { pathOnDisk?: string }) | null {
    return this.hostFiles.get(fileId) as any || null;
  }
  
  updateDefaultRoom(name: string, id?: string): void {
    const room = this.rooms.get(this.defaultRoomId);
    if (room) {
      room.roomName = name;
      if (id) {
        room.roomId = id;
      }
      room.updatedAt = Date.now();
    }
  }
  
  // ============================================================================
  // PEER MANAGEMENT
  // ============================================================================
  
  registerPeer(
    peerId: string,
    deviceName: string,
    platform: 'android' | 'ios' | 'web' | 'unknown',
    appVersion: string | undefined,
    ws: WebSocket
  ): VenuePeer {
    const peer: VenuePeer = {
      peerId,
      deviceName,
      platform,
      appVersion,
      roomId: null,
      sharedFiles: new Map(),
      lastSeen: Date.now(),
      joinedAt: Date.now(),
    };
    
    this.peers.set(peerId, peer);
    this.peerConnections.set(peerId, ws);
    
    console.log(`[RoomManager] Peer registered: ${deviceName} (${platform})`);
    return peer;
  }
  
  removePeer(peerId: string): VenuePeer | null {
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    
    // Remove from room
    if (peer.roomId) {
      this.leaveRoom(peerId);
    }
    
    // Remove files
    peer.sharedFiles.clear();
    
    // Remove connection
    this.peerConnections.delete(peerId);
    this.peers.delete(peerId);
    
    console.log(`[RoomManager] Peer removed: ${peer.deviceName}`);
    return peer;
  }
  
  getPeer(peerId: string): VenuePeer | null {
    return this.peers.get(peerId) || null;
  }
  
  updatePeerHeartbeat(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }
  
  getConnection(peerId: string): WebSocket | null {
    return this.peerConnections.get(peerId) || null;
  }
  
  // ============================================================================
  // ROOM MANAGEMENT
  // ============================================================================
  
  getDefaultRoom(): VenueRoom {
    return this.rooms.get(this.defaultRoomId)!;
  }
  
  getDefaultRoomId(): string {
    return this.defaultRoomId;
  }
  
  joinRoom(peerId: string, roomId?: string): VenueRoom | null {
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    
    const targetRoomId = roomId || this.defaultRoomId;
    const room = this.rooms.get(targetRoomId);
    if (!room) return null;
    
    peer.roomId = targetRoomId;
    room.updatedAt = Date.now();
    
    console.log(`[RoomManager] ${peer.deviceName} joined room: ${room.roomName}`);
    return room;
  }
  
  leaveRoom(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.roomId) return;
    
    const roomId = peer.roomId;
    peer.roomId = null;
    
    // Clear shared files
    const fileIds = Array.from(peer.sharedFiles.keys());
    peer.sharedFiles.clear();
    
    const room = this.rooms.get(roomId);
    if (room) {
      room.updatedAt = Date.now();
    }
    
    console.log(`[RoomManager] ${peer.deviceName} left room`);
  }
  
  getRoomPeers(roomId: string): VenuePeer[] {
    const peers: VenuePeer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.roomId === roomId) {
        peers.push(peer);
      }
    }
    return peers;
  }
  
  getRoomPeerCount(roomId: string): number {
    return this.getRoomPeers(roomId).length;
  }
  
  // ============================================================================
  // FILE INDEX
  // ============================================================================
  
  shareFiles(peerId: string, files: SharedFileMeta[]): SharedFileMeta[] {
    const peer = this.peers.get(peerId);
    if (!peer) return [];
    
    const added: SharedFileMeta[] = [];
    for (const file of files) {
      // Check file size limit
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > this.config.maxFileMB) {
        console.log(`[RoomManager] File too large: ${file.title} (${sizeMB.toFixed(1)}MB)`);
        continue;
      }
      
      peer.sharedFiles.set(file.id, file);
      added.push(file);
    }
    
    console.log(`[RoomManager] ${peer.deviceName} shared ${added.length} files`);
    return added;
  }
  
  unshareFiles(peerId: string, fileIds: string[]): string[] {
    const peer = this.peers.get(peerId);
    if (!peer) return [];
    
    const removed: string[] = [];
    for (const fileId of fileIds) {
      if (peer.sharedFiles.delete(fileId)) {
        removed.push(fileId);
      }
    }
    
    console.log(`[RoomManager] ${peer.deviceName} unshared ${removed.length} files`);
    return removed;
  }
  
  getRoomFiles(roomId: string): SharedFileMeta[] {
    const files: SharedFileMeta[] = [];
    
    // Add host files first
    for (const file of this.hostFiles.values()) {
      files.push(file);
    }
    
    // Add guest files
    for (const peer of this.peers.values()) {
      if (peer.roomId === roomId) {
        for (const file of peer.sharedFiles.values()) {
          files.push(file);
        }
      }
    }
    return files;
  }
  
  getFile(fileId: string): SharedFileMeta | null {
    // Check host files first
    const hostFile = this.hostFiles.get(fileId);
    if (hostFile) return hostFile;
    
    // Check peer files
    for (const peer of this.peers.values()) {
      const file = peer.sharedFiles.get(fileId);
      if (file) return file;
    }
    return null;
  }
  
  getFileOwner(fileId: string): VenuePeer | null {
    // Host files are owned by "venue-host" (no peer)
    if (this.hostFiles.has(fileId)) {
      return null; // Special case: handled separately
    }
    
    for (const peer of this.peers.values()) {
      if (peer.sharedFiles.has(fileId)) {
        return peer;
      }
    }
    return null;
  }
  
  isHostFile(fileId: string): boolean {
    return this.hostFiles.has(fileId);
  }
  
  // ============================================================================
  // RELAY TRANSFERS
  // ============================================================================
  
  createTransfer(
    fileId: string,
    ownerPeerId: string,
    requesterPeerId: string,
    size: number,
    mimeType: string,
    sha256: string,
    clientTransferId?: string // Use client's transferId if provided
  ): RelayTransfer {
    const transferId = clientTransferId || nanoid(12);
    const transfer: RelayTransfer = {
      transferId,
      fileId,
      ownerPeerId,
      requesterPeerId,
      size,
      mimeType,
      sha256,
      bytesTransferred: 0,
      state: 'pending',
      createdAt: Date.now(),
      pendingChunks: [],
    };
    
    this.transfers.set(transferId, transfer);
    console.log(`[RoomManager] Transfer created: ${transferId} for file ${fileId}`);
    return transfer;
  }
  
  getTransfer(transferId: string): RelayTransfer | null {
    return this.transfers.get(transferId) || null;
  }
  
  updateTransferProgress(transferId: string, bytesTransferred: number): void {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      transfer.bytesTransferred = bytesTransferred;
    }
  }
  
  setTransferState(transferId: string, state: RelayTransfer['state']): void {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      transfer.state = state;
      if (state === 'complete' || state === 'error') {
        // Clear any pending chunks
        transfer.pendingChunks = [];
      }
    }
  }
  
  removeTransfer(transferId: string): void {
    this.transfers.delete(transferId);
  }
  
  // ============================================================================
  // BROADCAST
  // ============================================================================
  
  broadcastToRoom(roomId: string, message: object, excludePeerId?: string): void {
    const messageStr = JSON.stringify(message);
    const peers = this.getRoomPeers(roomId);
    
    for (const peer of peers) {
      if (excludePeerId && peer.peerId === excludePeerId) continue;
      
      const conn = this.peerConnections.get(peer.peerId);
      if (conn && conn.readyState === WebSocket.OPEN) {
        conn.send(messageStr);
      }
    }
  }
  
  sendToPeer(peerId: string, message: object): boolean {
    const conn = this.peerConnections.get(peerId);
    if (conn && conn.readyState === WebSocket.OPEN) {
      conn.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  
  sendBinaryToPeer(peerId: string, data: Buffer): boolean {
    const conn = this.peerConnections.get(peerId);
    if (conn && conn.readyState === WebSocket.OPEN) {
      conn.send(data);
      return true;
    }
    return false;
  }
  
  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStalePeers();
      this.cleanupStaleTransfers();
    }, this.config.cleanupIntervalMs);
  }
  
  private cleanupStalePeers(): void {
    const now = Date.now();
    const staleThreshold = this.config.heartbeatTimeoutMs;
    
    for (const [peerId, peer] of this.peers) {
      if (now - peer.lastSeen > staleThreshold) {
        console.log(`[RoomManager] Removing stale peer: ${peer.deviceName}`);
        this.removePeer(peerId);
      }
    }
  }
  
  private cleanupStaleTransfers(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [transferId, transfer] of this.transfers) {
      if (now - transfer.createdAt > staleThreshold) {
        console.log(`[RoomManager] Removing stale transfer: ${transferId}`);
        this.transfers.delete(transferId);
      }
    }
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.peers.clear();
    this.peerConnections.clear();
    this.rooms.clear();
    this.transfers.clear();
  }
  
  // ============================================================================
  // STATS
  // ============================================================================
  
  getStats(): object {
    return {
      peerCount: this.peers.size,
      roomCount: this.rooms.size,
      activeTransfers: this.transfers.size,
      defaultRoom: {
        ...this.getDefaultRoom(),
        peerCount: this.getRoomPeerCount(this.defaultRoomId),
        fileCount: this.getRoomFiles(this.defaultRoomId).length,
      },
    };
  }
}

