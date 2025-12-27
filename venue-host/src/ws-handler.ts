/**
 * WebSocket Message Handler — Processes incoming messages and orchestrates responses
 */

import { WebSocket, RawData } from 'ws';
import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { RoomManager } from './room-manager.js';
import { hostState } from './host-state.js';
import {
  VenueMessageType,
  VenueHostConfig,
  DEFAULT_CONFIG,
  HelloMessageSchema,
  JoinRoomMessageSchema,
  ShareFilesMessageSchema,
  UnshareFilesMessageSchema,
  RequestFileMessageSchema,
  RelayPullMessageSchema,
  RelayPushMetaMessageSchema,
  RelayCompleteMessageSchema,
  SharedFileMeta,
} from './types.js';

export class WebSocketHandler {
  private config: VenueHostConfig;
  private roomManager: RoomManager;
  private hostId: string;
  
  // Track WS → peerId mapping
  private wsPeerMap: WeakMap<WebSocket, string> = new WeakMap();
  
  constructor(roomManager: RoomManager, config: Partial<VenueHostConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.roomManager = roomManager;
    this.hostId = `host-${nanoid(8)}`;
  }
  
  handleConnection(ws: WebSocket): void {
    console.log('[WS] New connection');
    
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.handleBinaryMessage(ws, data as Buffer);
      } else {
        this.handleTextMessage(ws, data.toString());
      }
    });
    
    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
    
    ws.on('error', (error) => {
      console.error('[WS] Connection error:', error.message);
    });
  }
  
  private handleTextMessage(ws: WebSocket, data: string): void {
    try {
      const message = JSON.parse(data);
      const type = message.type as VenueMessageType;
      
      switch (type) {
        case VenueMessageType.HELLO:
          this.handleHello(ws, message);
          break;
          
        case VenueMessageType.JOIN_ROOM:
          this.handleJoinRoom(ws, message);
          break;
          
        case VenueMessageType.LEAVE_ROOM:
          this.handleLeaveRoom(ws);
          break;
          
        case VenueMessageType.HEARTBEAT:
          this.handleHeartbeat(ws);
          break;
          
        case VenueMessageType.SHARE_FILES:
          this.handleShareFiles(ws, message);
          break;
          
        case VenueMessageType.UNSHARE_FILES:
          this.handleUnshareFiles(ws, message);
          break;
          
        case VenueMessageType.REQUEST_FILE:
          this.handleRequestFile(ws, message);
          break;
          
        case VenueMessageType.RELAY_PULL:
          this.handleRelayPull(ws, message);
          break;
          
        case VenueMessageType.RELAY_PUSH_META:
          this.handleRelayPushMeta(ws, message);
          break;
          
        case VenueMessageType.RELAY_COMPLETE:
          this.handleRelayComplete(ws, message);
          break;
          
        default:
          console.log('[WS] Unknown message type:', type);
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
      this.sendError(ws, 'PARSE_ERROR', 'Invalid message format');
    }
  }
  
  private handleBinaryMessage(ws: WebSocket, data: Buffer): void {
    // Binary messages are relay file chunks
    // Format: first 4 bytes = transferId length, then transferId string, then chunk data
    try {
      const peerId = this.wsPeerMap.get(ws);
      if (!peerId) {
        console.error('[WS] Binary from unknown peer');
        return;
      }
      
      // Parse header: [transferIdLen (4 bytes)][transferId][chunk data]
      if (data.length < 4) return;
      
      const transferIdLen = data.readUInt32BE(0);
      if (data.length < 4 + transferIdLen) return;
      
      const transferId = data.subarray(4, 4 + transferIdLen).toString('utf8');
      const chunkData = data.subarray(4 + transferIdLen);
      
      const transfer = this.roomManager.getTransfer(transferId);
      if (!transfer) {
        console.error('[WS] Unknown transfer:', transferId);
        return;
      }
      
      // Update progress
      transfer.bytesTransferred += chunkData.length;
      this.roomManager.updateTransferProgress(transferId, transfer.bytesTransferred);
      
      // Forward chunk to requester
      const sent = this.roomManager.sendBinaryToPeer(transfer.requesterPeerId, data);
      if (!sent) {
        console.error('[WS] Failed to forward chunk to requester');
        this.roomManager.setTransferState(transferId, 'error');
      }
      
      // Send progress update to requester
      const progress = Math.floor((transfer.bytesTransferred / transfer.size) * 100);
      this.roomManager.sendToPeer(transfer.requesterPeerId, {
        type: VenueMessageType.TRANSFER_PROGRESS,
        transferId,
        bytesTransferred: transfer.bytesTransferred,
        totalBytes: transfer.size,
        progress,
        ts: Date.now(),
      });
      
    } catch (error) {
      console.error('[WS] Binary message error:', error);
    }
  }
  
  private handleDisconnect(ws: WebSocket): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) return;
    
    const peer = this.roomManager.getPeer(peerId);
    if (!peer) return;
    
    const roomId = peer.roomId;
    this.roomManager.removePeer(peerId);
    
    // Broadcast peer left
    if (roomId) {
      this.roomManager.broadcastToRoom(roomId, {
        type: VenueMessageType.PEER_LEFT,
        peerId,
        ts: Date.now(),
      });
      
      // Broadcast updated file index
      const files = this.roomManager.getRoomFiles(roomId);
      this.roomManager.broadcastToRoom(roomId, {
        type: VenueMessageType.INDEX_FULL,
        files,
        ts: Date.now(),
      });
    }
    
    console.log(`[WS] Peer disconnected: ${peer.deviceName}`);
  }
  
  // ============================================================================
  // MESSAGE HANDLERS
  // ============================================================================
  
  private handleHello(ws: WebSocket, message: unknown): void {
    const parsed = HelloMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_HELLO', 'Invalid HELLO message');
      return;
    }
    
    const { peerId, deviceName, platform, appVersion } = parsed.data;
    
    // Check if peer already registered
    if (this.roomManager.getPeer(peerId)) {
      this.sendError(ws, 'ALREADY_REGISTERED', 'Peer already registered');
      return;
    }
    
    // Register peer
    this.roomManager.registerPeer(peerId, deviceName, platform, appVersion, ws);
    this.wsPeerMap.set(ws, peerId);
    
    // Send welcome
    this.send(ws, {
      type: VenueMessageType.WELCOME,
      hostId: this.hostId,
      hostName: this.config.serviceName,
      features: {
        relay: true,
        maxFileMB: this.config.maxFileMB,
      },
      ts: Date.now(),
    });
    
    console.log(`[WS] Welcome sent to: ${deviceName}`);
  }
  
  private handleJoinRoom(ws: WebSocket, message: unknown): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) {
      this.sendError(ws, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const parsed = JoinRoomMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_JOIN', 'Invalid JOIN_ROOM message');
      return;
    }
    
    const room = this.roomManager.joinRoom(peerId, parsed.data.roomId);
    if (!room) {
      this.sendError(ws, 'JOIN_FAILED', 'Failed to join room');
      return;
    }
    
    // Send room info
    this.send(ws, {
      type: VenueMessageType.ROOM_INFO,
      roomId: room.roomId,
      roomName: room.roomName,
      hostId: this.hostId,
      features: { relay: true },
      peerCount: this.roomManager.getRoomPeerCount(room.roomId),
      ts: Date.now(),
    });
    
    // Send full file index
    const files = this.roomManager.getRoomFiles(room.roomId);
    this.send(ws, {
      type: VenueMessageType.INDEX_FULL,
      files,
      ts: Date.now(),
    });
    
    // Send existing peers to the new peer
    const existingPeers = this.roomManager.getRoomPeers(room.roomId);
    for (const existingPeer of existingPeers) {
      if (existingPeer.peerId !== peerId) {
        this.send(ws, {
          type: VenueMessageType.PEER_JOINED,
          peer: {
            peerId: existingPeer.peerId,
            deviceName: existingPeer.deviceName,
            platform: existingPeer.platform,
            sharedFileCount: existingPeer.sharedFiles.size,
            joinedAt: existingPeer.joinedAt,
          },
          ts: Date.now(),
        });
      }
    }
    
    // Broadcast peer joined to others
    const peer = this.roomManager.getPeer(peerId)!;
    this.roomManager.broadcastToRoom(room.roomId, {
      type: VenueMessageType.PEER_JOINED,
      peer: {
        peerId: peer.peerId,
        deviceName: peer.deviceName,
        platform: peer.platform,
        sharedFileCount: peer.sharedFiles.size,
        joinedAt: peer.joinedAt,
      },
      ts: Date.now(),
    }, peerId);
  }
  
  private handleLeaveRoom(ws: WebSocket): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) return;
    
    const peer = this.roomManager.getPeer(peerId);
    if (!peer || !peer.roomId) return;
    
    const roomId = peer.roomId;
    this.roomManager.leaveRoom(peerId);
    
    // Broadcast peer left
    this.roomManager.broadcastToRoom(roomId, {
      type: VenueMessageType.PEER_LEFT,
      peerId,
      ts: Date.now(),
    });
    
    // Broadcast updated file index
    const files = this.roomManager.getRoomFiles(roomId);
    this.roomManager.broadcastToRoom(roomId, {
      type: VenueMessageType.INDEX_FULL,
      files,
      ts: Date.now(),
    });
  }
  
  private handleHeartbeat(ws: WebSocket): void {
    const peerId = this.wsPeerMap.get(ws);
    if (peerId) {
      this.roomManager.updatePeerHeartbeat(peerId);
    }
  }
  
  private handleShareFiles(ws: WebSocket, message: unknown): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) {
      this.sendError(ws, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    // Check room lock
    if (hostState.isRoomLocked()) {
      console.log(`[WS] SHARE_FILES rejected: room is locked`);
      this.sendError(ws, 'ROOM_LOCKED', 'Room is locked: only host can share files.');
      return;
    }
    
    const parsed = ShareFilesMessageSchema.safeParse(message);
    if (!parsed.success) {
      console.error('[WS] Invalid SHARE_FILES:', parsed.error.errors);
      this.sendError(ws, 'INVALID_SHARE', 'Invalid SHARE_FILES message');
      return;
    }
    
    console.log(`[WS] SHARE_FILES from ${peerId}:`, parsed.data.files.length, 'files');
    
    const peer = this.roomManager.getPeer(peerId);
    if (!peer || !peer.roomId) {
      this.sendError(ws, 'NOT_IN_ROOM', 'Join a room first');
      return;
    }
    
    const addedFiles = this.roomManager.shareFiles(peerId, parsed.data.files);
    console.log(`[WS] Added ${addedFiles.length} files to room ${peer.roomId}`);
    
    if (addedFiles.length > 0) {
      // Broadcast index upsert
      this.roomManager.broadcastToRoom(peer.roomId, {
        type: VenueMessageType.INDEX_UPSERT,
        files: addedFiles,
        ts: Date.now(),
      });
    }
  }
  
  private handleUnshareFiles(ws: WebSocket, message: unknown): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) return;
    
    // Check room lock
    if (hostState.isRoomLocked()) {
      this.sendError(ws, 'ROOM_LOCKED', 'Room is locked: only host can modify files.');
      return;
    }
    
    const parsed = UnshareFilesMessageSchema.safeParse(message);
    if (!parsed.success) return;
    
    const peer = this.roomManager.getPeer(peerId);
    if (!peer || !peer.roomId) return;
    
    const removedIds = this.roomManager.unshareFiles(peerId, parsed.data.fileIds);
    
    if (removedIds.length > 0) {
      // Broadcast index remove
      this.roomManager.broadcastToRoom(peer.roomId, {
        type: VenueMessageType.INDEX_REMOVE,
        fileIds: removedIds,
        ts: Date.now(),
      });
    }
  }
  
  private handleRequestFile(ws: WebSocket, message: unknown): void {
    const peerId = this.wsPeerMap.get(ws);
    if (!peerId) {
      this.sendError(ws, 'NOT_REGISTERED', 'Send HELLO first');
      return;
    }
    
    const parsed = RequestFileMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_REQUEST', 'Invalid REQUEST_FILE message');
      return;
    }
    
    const { fileId, ownerPeerId } = parsed.data;
    
    // Find the file
    const file = this.roomManager.getFile(fileId);
    if (!file) {
      this.sendError(ws, 'FILE_NOT_FOUND', 'File not found');
      return;
    }
    
    // Send file offer to requester (telling them relay will be used)
    this.send(ws, {
      type: VenueMessageType.FILE_OFFER,
      fileId,
      ownerPeerId: file.ownerPeerId,
      relay: true,
      ts: Date.now(),
    });
    
    console.log(`[WS] File request: ${fileId} from ${peerId} to ${ownerPeerId}`);
  }
  
  private handleRelayPull(ws: WebSocket, message: unknown): void {
    const requesterPeerId = this.wsPeerMap.get(ws);
    if (!requesterPeerId) return;
    
    const parsed = RelayPullMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_PULL', 'Invalid RELAY_PULL message');
      return;
    }
    
    const { fileId, transferId } = parsed.data;
    
    // Find file
    const file = this.roomManager.getFile(fileId);
    if (!file) {
      this.sendError(ws, 'FILE_NOT_FOUND', 'File not found');
      return;
    }
    
    // Check if this is a host file
    if (this.roomManager.isHostFile(fileId)) {
      // Host file - serve directly from disk
      this.serveHostFile(ws, fileId, transferId, requesterPeerId);
      return;
    }
    
    // Guest file - find owner
    const owner = this.roomManager.getFileOwner(fileId);
    if (!owner) {
      this.sendError(ws, 'OWNER_OFFLINE', 'File owner is offline');
      return;
    }
    
    // Create transfer tracking - use the client's transferId to ensure chunks are recognized
    const transfer = this.roomManager.createTransfer(
      fileId,
      owner.peerId,
      requesterPeerId,
      file.size,
      file.mimeType,
      file.sha256,
      transferId // Pass the client's transferId
    );
    
    // Notify requester that transfer is starting
    this.send(ws, {
      type: VenueMessageType.TRANSFER_START,
      transferId, // Use the original client transferId
      fileId,
      size: file.size,
      mimeType: file.mimeType,
      ts: Date.now(),
    });
    
    // Ask owner to push the file
    this.roomManager.sendToPeer(owner.peerId, {
      type: VenueMessageType.RELAY_PULL,
      fileId,
      transferId: transfer.transferId,
      requesterPeerId,
      ts: Date.now(),
    });
    
    this.roomManager.setTransferState(transfer.transferId, 'uploading');
    console.log(`[WS] Relay transfer initiated: ${transfer.transferId}`);
  }
  
  private async serveHostFile(ws: WebSocket, fileId: string, transferId: string, requesterPeerId: string): Promise<void> {
    const hostFile = this.roomManager.getHostFile(fileId);
    if (!hostFile || !hostFile.pathOnDisk) {
      this.sendError(ws, 'FILE_NOT_FOUND', 'Host file not found');
      return;
    }
    
    console.log(`[WS] Serving host file: ${hostFile.title}`);
    
    // Create transfer
    const transfer = this.roomManager.createTransfer(
      fileId,
      'venue-host',
      requesterPeerId,
      hostFile.size,
      hostFile.mimeType,
      hostFile.sha256,
      transferId
    );
    
    // Notify requester that transfer is starting
    this.send(ws, {
      type: VenueMessageType.TRANSFER_START,
      transferId,
      fileId,
      size: hostFile.size,
      mimeType: hostFile.mimeType,
      ts: Date.now(),
    });
    
    this.roomManager.setTransferState(transferId, 'uploading');
    
    try {
      // Read file and send chunks
      const fileBuffer = readFileSync(hostFile.pathOnDisk);
      const CHUNK_SIZE = 64 * 1024;
      let offset = 0;
      
      while (offset < fileBuffer.length) {
        const chunk = fileBuffer.slice(offset, offset + CHUNK_SIZE);
        
        // Create binary frame: [transferIdLen (4 bytes)][transferId][chunk]
        const transferIdBytes = Buffer.from(transferId, 'utf-8');
        const frame = Buffer.alloc(4 + transferIdBytes.length + chunk.length);
        frame.writeUInt32BE(transferIdBytes.length, 0);
        transferIdBytes.copy(frame, 4);
        chunk.copy(frame, 4 + transferIdBytes.length);
        
        ws.send(frame);
        
        offset += chunk.length;
        this.roomManager.updateTransferProgress(transferId, offset);
        
        // Small delay to avoid overwhelming
        await new Promise(r => setTimeout(r, 5));
      }
      
      // Send completion
      this.send(ws, {
        type: VenueMessageType.TRANSFER_COMPLETE,
        transferId,
        fileId,
        sha256: hostFile.sha256,
        ts: Date.now(),
      });
      
      this.roomManager.setTransferState(transferId, 'complete');
      console.log(`[WS] Host file transfer complete: ${transferId}`);
      
    } catch (err: any) {
      console.error(`[WS] Failed to serve host file:`, err);
      this.sendError(ws, 'TRANSFER_ERROR', err.message);
      this.roomManager.setTransferState(transferId, 'error');
    }
  }
  
  private handleRelayPushMeta(ws: WebSocket, message: unknown): void {
    const parsed = RelayPushMetaMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_META', 'Invalid RELAY_PUSH_META message');
      return;
    }
    
    const { transferId, fileId, size, mimeType, sha256 } = parsed.data;
    
    const transfer = this.roomManager.getTransfer(transferId);
    if (!transfer) {
      this.sendError(ws, 'TRANSFER_NOT_FOUND', 'Transfer not found');
      return;
    }
    
    // Update transfer with actual size from owner
    transfer.size = size;
    transfer.mimeType = mimeType;
    transfer.sha256 = sha256;
    this.roomManager.setTransferState(transferId, 'uploading');
    
    // Notify requester that file is coming
    this.roomManager.sendToPeer(transfer.requesterPeerId, {
      type: VenueMessageType.TRANSFER_START,
      transferId,
      fileId,
      size,
      mimeType,
      ts: Date.now(),
    });
    
    console.log(`[WS] Relay push meta received for: ${transferId}`);
  }
  
  private handleRelayComplete(ws: WebSocket, message: unknown): void {
    const parsed = RelayCompleteMessageSchema.safeParse(message);
    if (!parsed.success) return;
    
    const { transferId, fileId } = parsed.data;
    
    const transfer = this.roomManager.getTransfer(transferId);
    if (!transfer) return;
    
    this.roomManager.setTransferState(transferId, 'complete');
    
    // Notify requester
    this.roomManager.sendToPeer(transfer.requesterPeerId, {
      type: VenueMessageType.TRANSFER_COMPLETE,
      transferId,
      fileId,
      sha256: transfer.sha256,
      ts: Date.now(),
    });
    
    console.log(`[WS] Transfer complete: ${transferId}`);
    
    // Cleanup after a delay
    setTimeout(() => {
      this.roomManager.removeTransfer(transferId);
    }, 5000);
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  private send(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  
  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, {
      type: VenueMessageType.ERROR,
      code,
      message,
      ts: Date.now(),
    });
  }
}

