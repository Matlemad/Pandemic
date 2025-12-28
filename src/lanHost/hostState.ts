/**
 * LAN Host State — Manages room state for phone-hosted LAN rooms
 * 
 * Similar to venue-host/host-state.ts but for in-app phone hosting.
 */

import { LanHostRoom, LanHostPeer, LanHostFile } from './types';
import { nanoid } from 'nanoid/non-secure';

export interface LanHostStateData {
  room: LanHostRoom | null;
  hostFiles: LanHostFile[];
}

/**
 * LAN Host State Manager
 * 
 * Manages the state of a phone-hosted room (room config, host files, peers).
 * This is in-memory only (no persistence) since phone hosting is ephemeral.
 */
class LanHostStateManager {
  private room: LanHostRoom | null = null;
  private hostFiles: Map<string, LanHostFile> = new Map();
  private peers: Map<string, LanHostPeer> = new Map();
  private files: Map<string, LanHostFile> = new Map(); // All files (host + peers)
  
  // Callbacks
  private onChangeCallbacks: Array<(state: LanHostStateData) => void> = [];
  
  /**
   * Create or update the active room
   */
  createOrUpdateRoom(name: string, locked: boolean = false, port: number = 8787): LanHostRoom {
    const now = Date.now();
    
    if (this.room) {
      // Update existing room
      this.room.name = name;
      this.room.locked = locked;
      this.room.updatedAt = now;
    } else {
      // Create new room
      this.room = {
        id: nanoid(10),
        name,
        locked,
        port,
        createdAt: now,
        updatedAt: now,
      };
    }
    
    this.notifyChange();
    return this.room;
  }
  
  /**
   * Get current room
   */
  getRoom(): LanHostRoom | null {
    return this.room;
  }
  
  /**
   * Set room lock state
   */
  setRoomLock(locked: boolean): void {
    if (!this.room) return;
    
    this.room.locked = locked;
    this.room.updatedAt = Date.now();
    this.notifyChange();
  }
  
  /**
   * Close the room
   */
  closeRoom(): void {
    this.room = null;
    this.peers.clear();
    this.files.clear();
    // Keep hostFiles for next room
    this.notifyChange();
  }
  
  /**
   * Add a host file (uploaded by host)
   */
  addHostFile(file: Omit<LanHostFile, 'ownerPeerId' | 'ownerName' | 'addedAt'> & { localUri: string }): LanHostFile {
    const hostFile: LanHostFile = {
      ...file,
      ownerPeerId: 'phone-host',
      ownerName: 'Host',
      addedAt: Date.now(),
    };
    
    this.hostFiles.set(hostFile.id, hostFile);
    this.files.set(hostFile.id, hostFile);
    this.notifyChange();
    return hostFile;
  }
  
  /**
   * Remove a host file
   */
  removeHostFile(fileId: string): boolean {
    const removed = this.hostFiles.delete(fileId);
    if (removed) {
      this.files.delete(fileId);
      this.notifyChange();
    }
    return removed;
  }
  
  /**
   * Get all host files
   */
  getHostFiles(): LanHostFile[] {
    return Array.from(this.hostFiles.values());
  }
  
  /**
   * Get published host files (for sharing in room)
   */
  getPublishedFiles(): LanHostFile[] {
    return Array.from(this.hostFiles.values());
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
   * Get all peers
   */
  getPeers(): LanHostPeer[] {
    return Array.from(this.peers.values());
  }
  
  /**
   * Add a file (from peer or host)
   */
  addFile(file: LanHostFile): void {
    this.files.set(file.id, file);
  }
  
  /**
   * Remove a file
   */
  removeFile(fileId: string): void {
    this.files.delete(fileId);
    // Also remove from hostFiles if it's a host file
    this.hostFiles.delete(fileId);
  }
  
  /**
   * Get all files
   */
  getFiles(): LanHostFile[] {
    return Array.from(this.files.values());
  }
  
  /**
   * Get file by ID
   */
  getFile(fileId: string): LanHostFile | undefined {
    return this.files.get(fileId);
  }
  
  /**
   * Check if file is owned by host
   */
  isHostFile(fileId: string): boolean {
    return this.hostFiles.has(fileId);
  }
  
  /**
   * Get file owner peer ID
   */
  getFileOwner(fileId: string): string | null {
    const file = this.files.get(fileId);
    return file?.ownerPeerId || null;
  }
  
  /**
   * Subscribe to state changes
   */
  onChange(callback: (state: LanHostStateData) => void): () => void {
    this.onChangeCallbacks.push(callback);
    
    // Immediately call with current state
    callback(this.getState());
    
    // Return unsubscribe function
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * Get current state
   */
  getState(): LanHostStateData {
    return {
      room: this.room,
      hostFiles: this.getPublishedFiles(),
    };
  }
  
  /**
   * Notify all callbacks of state change
   */
  private notifyChange(): void {
    const state = this.getState();
    for (const callback of this.onChangeCallbacks) {
      try {
        callback(state);
      } catch (error) {
        console.error('[LanHostState] Callback error:', error);
      }
    }
  }
  
  /**
   * Reset all state
   */
  reset(): void {
    this.room = null;
    this.hostFiles.clear();
    this.peers.clear();
    this.files.clear();
    this.onChangeCallbacks = [];
  }
}

// Export singleton
export const lanHostState = new LanHostStateManager();
export default lanHostState;

