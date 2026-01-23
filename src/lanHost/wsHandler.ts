/**
 * WebSocket Message Handler for Phone Host Server
 * 
 * Handles incoming WebSocket messages and orchestrates responses.
 * Similar to venue-host/ws-handler.ts but adapted for in-app phone hosting.
 */

import { phoneHostServer, isLanHostAvailable } from './PhoneHostServer';
import { lanHostState } from './hostState';
import { VenueMessageType } from '../venue/types';
import { nanoid } from 'nanoid/non-secure';

// Re-define message types locally
interface HelloMessage {
  type: VenueMessageType.HELLO;
  peerId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  ts: number;
}

interface JoinRoomMessage {
  type: VenueMessageType.JOIN_ROOM;
  roomId?: string;
  ts: number;
}

interface ShareFilesMessage {
  type: VenueMessageType.SHARE_FILES;
  files: Array<{
    id: string;
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
    size: number;
    mimeType: string;
    sha256: string;
  }>;
  ts: number;
}

interface UnshareFilesMessage {
  type: VenueMessageType.UNSHARE_FILES;
  fileIds: string[];
  ts: number;
}

interface RequestFileMessage {
  type: VenueMessageType.REQUEST_FILE;
  fileId: string;
  ownerPeerId: string;
  ts: number;
}

interface RelayPullMessage {
  type: VenueMessageType.RELAY_PULL;
  fileId: string;
  transferId: string;
  ts: number;
}

interface RelayPushMetaMessage {
  type: VenueMessageType.RELAY_PUSH_META;
  transferId: string;
  fileId: string;
  size: number;
  mimeType: string;
  sha256: string;
  ts: number;
}

interface RelayCompleteMessage {
  type: VenueMessageType.RELAY_COMPLETE;
  transferId: string;
  fileId: string;
  ts: number;
}

interface HeartbeatMessage {
  type: VenueMessageType.HEARTBEAT;
  ts: number;
}

type VenueMessage = 
  | HelloMessage
  | JoinRoomMessage
  | ShareFilesMessage
  | UnshareFilesMessage
  | RequestFileMessage
  | RelayPullMessage
  | RelayPushMetaMessage
  | RelayCompleteMessage
  | HeartbeatMessage;

/**
 * WebSocket Handler for Phone Host
 */
class PhoneHostWSHandler {
  private clientPeerMap: Map<string, string> = new Map(); // clientId -> peerId
  private peerClientMap: Map<string, string> = new Map(); // peerId -> clientId
  private activeTransfers: Map<string, {
    transferId: string;
    fileId: string;
    ownerPeerId: string;
    requesterPeerId: string;
    size: number;
    mimeType: string;
    sha256: string;
    state: 'pending' | 'uploading' | 'downloading' | 'complete' | 'error';
    bytesTransferred: number;
  }> = new Map();
  
  private isInitialized = false;
  
  constructor() {
    this.initialize();
  }
  
  private initialize(): void {
    if (this.isInitialized || !isLanHostAvailable) {
      return;
    }
    
    // Setup phone host server callbacks
    phoneHostServer.setCallbacks({
      onClientConnected: (clientId) => {
        console.log('[PhoneHostWS] Client connected:', clientId);
      },
      onClientDisconnected: (clientId) => {
        const peerId = this.clientPeerMap.get(clientId);
        if (peerId) {
          this.handlePeerDisconnected(peerId);
        }
        this.clientPeerMap.delete(clientId);
        if (peerId) {
          this.peerClientMap.delete(peerId);
        }
      },
      onClientMessage: (clientId, message, isBinary) => {
        if (isBinary) {
          // Handle binary message (file chunks)
          this.handleBinaryMessage(clientId, message);
        } else {
          this.handleMessage(clientId, message);
        }
      },
      onError: (error, clientId) => {
        console.error('[PhoneHostWS] Error:', error, 'Client:', clientId);
      },
      onStarted: (port) => {
        console.log('[PhoneHostWS] Server started on port', port);
      },
      onStopped: () => {
        console.log('[PhoneHostWS] Server stopped');
        this.cleanup();
      },
    });
    
    this.isInitialized = true;
  }
  
  private cleanup(): void {
    this.clientPeerMap.clear();
    this.peerClientMap.clear();
    this.activeTransfers.clear();
  }
  
  private handleBinaryMessage(clientId: string, base64Data: string): void {
    // Binary messages are file chunks for relay
    // Format: [transferIdLen (4 bytes)][transferId][chunk data]
    try {
      // Decode base64
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Extract transfer ID
      if (bytes.length < 4) return;
      const transferIdLen = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
      if (bytes.length < 4 + transferIdLen) return;
      
      const transferIdBytes = bytes.slice(4, 4 + transferIdLen);
      const transferId = new TextDecoder().decode(transferIdBytes);
      const chunkData = bytes.slice(4 + transferIdLen);
      
      // Find transfer and forward to requester
      const transfer = this.activeTransfers.get(transferId);
      if (!transfer) {
        console.warn('[PhoneHostWS] Chunk for unknown transfer:', transferId);
        return;
      }
      
      transfer.bytesTransferred += chunkData.length;
      
      // Forward chunk to requester
      const requesterClientId = this.peerClientMap.get(transfer.requesterPeerId);
      if (requesterClientId) {
        // Re-encode and send
        phoneHostServer.sendBinaryToClient(requesterClientId, base64Data);
      }
    } catch (error) {
      console.error('[PhoneHostWS] Failed to handle binary message:', error);
    }
  }
  
  /**
   * Handle incoming message from a client
   */
  private async handleMessage(clientId: string, message: any): Promise<void> {
    try {
      const msg = message as VenueMessage;
      
      switch (msg.type) {
        case VenueMessageType.HELLO:
          await this.handleHello(clientId, msg);
          break;
        case VenueMessageType.JOIN_ROOM:
          await this.handleJoinRoom(clientId, msg);
          break;
        case VenueMessageType.SHARE_FILES:
          await this.handleShareFiles(clientId, msg);
          break;
        case VenueMessageType.UNSHARE_FILES:
          await this.handleUnshareFiles(clientId, msg);
          break;
        case VenueMessageType.REQUEST_FILE:
          await this.handleRequestFile(clientId, msg);
          break;
        case VenueMessageType.RELAY_PULL:
          await this.handleRelayPull(clientId, msg);
          break;
        case VenueMessageType.RELAY_PUSH_META:
          await this.handleRelayPushMeta(clientId, msg);
          break;
        case VenueMessageType.RELAY_COMPLETE:
          await this.handleRelayComplete(clientId, msg);
          break;
        case VenueMessageType.HEARTBEAT:
          // Silently ignore heartbeat - just keeps connection alive
          break;
        default:
          console.warn('[PhoneHostWS] Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('[PhoneHostWS] Error handling message:', error);
      this.sendError(clientId, 'INVALID_MESSAGE', 'Failed to process message');
    }
  }
  
  private async handleHello(clientId: string, message: HelloMessage): Promise<void> {
    const { peerId, deviceName, platform } = message;
    
    // Map client to peer
    this.clientPeerMap.set(clientId, peerId);
    this.peerClientMap.set(peerId, clientId);
    
    // Send welcome
    await this.send(clientId, {
      type: VenueMessageType.WELCOME,
      hostId: 'phone-host',
      capabilities: {
        relay: true,
        maxFileMB: 50,
      },
      ts: Date.now(),
    });
    
    console.log('[PhoneHostWS] Peer registered:', peerId, deviceName);
  }
  
  private async handleJoinRoom(clientId: string, message: JoinRoomMessage): Promise<void> {
    const peerId = this.clientPeerMap.get(clientId);
    if (!peerId) {
      this.sendError(clientId, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const room = lanHostState.getRoom();
    if (!room) {
      this.sendError(clientId, 'NO_ROOM', 'No room active');
      return;
    }
    
    const isHostPeer = lanHostState.isHostPeer(peerId);
    // Add peer only if it's not the host device
    if (!isHostPeer) {
      lanHostState.addPeer({
        peerId,
        deviceName: 'Guest', // Will be updated from HELLO if available
        platform: 'unknown',
        sharedFileCount: 0,
        joinedAt: Date.now(),
      });
    }
    
    // Send room info
    await this.send(clientId, {
      type: VenueMessageType.ROOM_INFO,
      roomId: room.id,
      roomName: room.name,
      hostId: 'phone-host',
      peerCount: lanHostState.getPeers().length,
      locked: room.locked,
      ts: Date.now(),
    });
    
    // Send full file index
    const files = lanHostState.getFiles();
    await this.send(clientId, {
      type: VenueMessageType.INDEX_FULL,
      files: files.map(f => ({
        id: f.id,
        title: f.title,
        artist: f.artist,
        album: f.album,
        duration: f.duration,
        size: f.size,
        mimeType: f.mimeType,
        sha256: f.sha256,
        ownerPeerId: f.ownerPeerId,
        ownerName: f.ownerName,
        addedAt: f.addedAt,
      })),
      ts: Date.now(),
    });
    
    // Broadcast peer joined (exclude host device)
    if (!isHostPeer) {
      await this.broadcast({
        type: VenueMessageType.PEER_JOINED,
        peer: {
          peerId,
          deviceName: 'Guest',
          platform: 'unknown',
          sharedFileCount: 0,
        },
        ts: Date.now(),
      }, clientId);
    }
    
    console.log('[PhoneHostWS] Peer joined room:', peerId);
  }
  
  private async handleShareFiles(clientId: string, message: ShareFilesMessage): Promise<void> {
    const peerId = this.clientPeerMap.get(clientId);
    if (!peerId) {
      this.sendError(clientId, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const room = lanHostState.getRoom();
    if (!room) {
      this.sendError(clientId, 'NO_ROOM', 'No room active');
      return;
    }
    
    // Check lock - host can always share (identified by matching deviceId)
    const hostDeviceId = lanHostState.getHostPeerId();
    const isHost = lanHostState.isHostPeer(peerId);
    console.log('[PhoneHostWS] ShareFiles check - peerId:', peerId, 'hostDeviceId:', hostDeviceId, 'isHost:', isHost, 'locked:', room.locked);
    
    if (room.locked && !isHost) {
      console.log('[PhoneHostWS] BLOCKED: Room is locked and peer is not host');
      this.sendError(clientId, 'ROOM_LOCKED', 'Room is locked: only host can share files');
      return;
    }
    
    console.log('[PhoneHostWS] ShareFiles ALLOWED from', peerId);
    
    // Add files
    for (const file of message.files) {
      lanHostState.addFile({
        ...file,
        ownerPeerId: peerId,
        ownerName: 'Guest',
        addedAt: Date.now(),
      });
    }
    
    // Broadcast file updates
    await this.broadcast({
      type: VenueMessageType.INDEX_UPSERT,
      files: message.files.map(f => ({
        id: f.id,
        title: f.title,
        artist: f.artist,
        album: f.album,
        duration: f.duration,
        size: f.size,
        mimeType: f.mimeType,
        sha256: f.sha256,
        ownerPeerId: peerId,
        ownerName: 'Guest',
        addedAt: Date.now(),
      })),
      ts: Date.now(),
    });
    
    console.log('[PhoneHostWS] Files shared:', message.files.length);
  }
  
  private async handleUnshareFiles(clientId: string, message: UnshareFilesMessage): Promise<void> {
    const peerId = this.clientPeerMap.get(clientId);
    if (!peerId) {
      this.sendError(clientId, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const room = lanHostState.getRoom();
    if (!room) {
      this.sendError(clientId, 'NO_ROOM', 'No room active');
      return;
    }
    
    // Check lock - host can always unshare (identified by matching deviceId)
    const isHost = lanHostState.isHostPeer(peerId);
    if (room.locked && !isHost) {
      this.sendError(clientId, 'ROOM_LOCKED', 'Room is locked: only host can unshare files');
      return;
    }
    
    // Remove files
    for (const fileId of message.fileIds) {
      const file = lanHostState.getFile(fileId);
      if (file && file.ownerPeerId === peerId) {
        lanHostState.removeFile(fileId);
      }
    }
    
    // Broadcast removal
    await this.broadcast({
      type: VenueMessageType.INDEX_REMOVE,
      fileIds: message.fileIds,
      ts: Date.now(),
    });
  }
  
  private async handleRequestFile(clientId: string, message: RequestFileMessage): Promise<void> {
    const peerId = this.clientPeerMap.get(clientId);
    if (!peerId) {
      this.sendError(clientId, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const file = lanHostState.getFile(message.fileId);
    if (!file) {
      this.sendError(clientId, 'FILE_NOT_FOUND', 'File not found');
      return;
    }
    
    // Send file offer (always use relay)
    await this.send(clientId, {
      type: VenueMessageType.FILE_OFFER,
      fileId: message.fileId,
      ownerPeerId: file.ownerPeerId,
      relay: true,
      ts: Date.now(),
    });
  }
  
  private async handleRelayPull(clientId: string, message: RelayPullMessage): Promise<void> {
    const requesterPeerId = this.clientPeerMap.get(clientId);
    if (!requesterPeerId) {
      this.sendError(clientId, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const file = lanHostState.getFile(message.fileId);
    if (!file) {
      this.sendError(clientId, 'FILE_NOT_FOUND', 'File not found');
      return;
    }
    
    // Check if host file
    if (lanHostState.isHostFile(message.fileId)) {
      // Serve host file directly
      await this.serveHostFile(clientId, message.fileId, message.transferId, requesterPeerId);
      return;
    }
    
    // Guest file - find owner and request upload
    const ownerPeerId = lanHostState.getFileOwner(message.fileId);
    if (!ownerPeerId) {
      this.sendError(clientId, 'OWNER_OFFLINE', 'File owner is offline');
      return;
    }
    
    // Create transfer
    this.activeTransfers.set(message.transferId, {
      transferId: message.transferId,
      fileId: message.fileId,
      ownerPeerId,
      requesterPeerId,
      size: file.size,
      mimeType: file.mimeType,
      sha256: file.sha256,
      state: 'pending',
      bytesTransferred: 0,
    });
    
    // Notify requester
    await this.send(clientId, {
      type: VenueMessageType.TRANSFER_START,
      transferId: message.transferId,
      fileId: message.fileId,
      size: file.size,
      mimeType: file.mimeType,
      ts: Date.now(),
    });
    
    // Request owner to push
    const ownerClientId = this.peerClientMap.get(ownerPeerId);
    if (ownerClientId) {
      await this.send(ownerClientId, {
        type: VenueMessageType.RELAY_PULL,
        fileId: message.fileId,
        transferId: message.transferId,
        requesterPeerId,
        ts: Date.now(),
      });
    }
    
    console.log('[PhoneHostWS] Relay pull initiated:', message.transferId);
  }
  
  private async serveHostFile(clientId: string, fileId: string, transferId: string, requesterPeerId: string): Promise<void> {
    const file = lanHostState.getFile(fileId);
    if (!file || !file.localUri) {
      this.sendError(clientId, 'FILE_NOT_FOUND', 'Host file not found');
      return;
    }
    
    // TODO: Implement file reading and chunked sending
    // For now, this is a placeholder
    console.log('[PhoneHostWS] Serving host file:', file.title);
    this.sendError(clientId, 'NOT_IMPLEMENTED', 'Host file serving not yet implemented');
  }
  
  private async handleRelayPushMeta(clientId: string, message: RelayPushMetaMessage): Promise<void> {
    const transfer = this.activeTransfers.get(message.transferId);
    if (!transfer) {
      this.sendError(clientId, 'TRANSFER_NOT_FOUND', 'Transfer not found');
      return;
    }
    
    // Update transfer
    transfer.size = message.size;
    transfer.mimeType = message.mimeType;
    transfer.sha256 = message.sha256;
    transfer.state = 'uploading';
    
    // Notify requester
    const requesterClientId = this.peerClientMap.get(transfer.requesterPeerId);
    if (requesterClientId) {
      await this.send(requesterClientId, {
        type: VenueMessageType.TRANSFER_START,
        transferId: message.transferId,
        fileId: message.fileId,
        size: message.size,
        mimeType: message.mimeType,
        ts: Date.now(),
      });
    }
  }
  
  private async handleRelayComplete(clientId: string, message: RelayCompleteMessage): Promise<void> {
    const transfer = this.activeTransfers.get(message.transferId);
    if (!transfer) return;
    
    transfer.state = 'complete';
    
    // Notify requester
    const requesterClientId = this.peerClientMap.get(transfer.requesterPeerId);
    if (requesterClientId) {
      await this.send(requesterClientId, {
        type: VenueMessageType.TRANSFER_COMPLETE,
        transferId: message.transferId,
        fileId: message.fileId,
        sha256: transfer.sha256,
        ts: Date.now(),
      });
    }
    
    // Cleanup
    setTimeout(() => {
      this.activeTransfers.delete(message.transferId);
    }, 5000);
  }
  
  private handlePeerDisconnected(peerId: string): void {
    lanHostState.removePeer(peerId);
    
    // Broadcast peer left
    this.broadcast({
      type: VenueMessageType.PEER_LEFT,
      peerId,
      ts: Date.now(),
    });
  }
  
  private async send(clientId: string, message: any): Promise<void> {
    await phoneHostServer.sendToClient(clientId, message);
  }
  
  private async broadcast(message: any, excludeClientId?: string): Promise<void> {
    await phoneHostServer.broadcast(message);
  }
  
  private sendError(clientId: string, code: string, message: string): void {
    this.send(clientId, {
      type: VenueMessageType.ERROR,
      code,
      message,
      ts: Date.now(),
    });
  }
}

// Export singleton
export const phoneHostWSHandler = new PhoneHostWSHandler();
export default phoneHostWSHandler;

