/**
 * P2P Room Service Adapter
 * 
 * Bridges the new P2P Room Service with existing Zustand stores,
 * providing the same interface as the old RoomService.
 */

import { p2pRoomService, RoomState as P2PRoomState, RoomRole as P2PRoomRole } from '../p2p/protocol';
import { SharedFile, RoomPeer } from '../p2p/protocol/types';
import { useRoomStore } from '../stores/roomStore';
import { useAppStore } from '../stores/appStore';
import { useTransferStore } from '../stores/transferStore';
import { fileStorageService, LocalAudioFile } from './FileStorageService';
import { venueLanTransport } from '../venue/transport';
import {
  RoomInfo,
  RoomRole,
  PeerInfo,
  SharedFileMetadata,
  TransferDirection,
  TransferState,
  TransportMode,
} from '../types';
import { DiscoveredRoom as LegacyDiscoveredRoom } from '../types';
import { DiscoveredRoom, TransferProgress, ReceivedFile } from '../p2p/types';

class P2PRoomServiceAdapter {
  private isInitialized = false;

  /**
   * Initialize the P2P service with device name
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      const deviceName = useAppStore.getState().deviceName;
      
      // Initialize file storage first
      await fileStorageService.initialize();
      
      // Initialize P2P service
      const success = await p2pRoomService.initialize(deviceName);
      
      if (success) {
        this.setupCallbacks();
        this.isInitialized = true;
        console.log('[P2PAdapter] Initialized');
      }
      
      return success;
    } catch (error) {
      console.error('[P2PAdapter] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Setup callbacks to sync P2P events with Zustand stores
   */
  private setupCallbacks(): void {
    p2pRoomService.setCallbacks({
      onRoomCreated: this.handleRoomCreated.bind(this),
      onRoomJoined: this.handleRoomJoined.bind(this),
      onRoomLeft: this.handleRoomLeft.bind(this),
      onPeerJoined: this.handlePeerJoined.bind(this),
      onPeerLeft: this.handlePeerLeft.bind(this),
      onFilesUpdated: this.handleFilesUpdated.bind(this),
      onFileRequest: this.handleFileRequest.bind(this),
      onTransferProgress: this.handleTransferProgress.bind(this),
      onFileReceived: this.handleFileReceived.bind(this),
      onError: this.handleError.bind(this),
    });
  }

  // ============================================================================
  // ROOM MANAGEMENT
  // ============================================================================

  /**
   * Create a new room (Host mode)
   */
  async createRoom(roomName: string): Promise<RoomInfo | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const room = await p2pRoomService.createRoom(roomName);
    
    if (room) {
      return this.convertToRoomInfo(room);
    }
    
    return null;
  }

  /**
   * Start scanning for nearby rooms
   */
  async startScanning(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    useRoomStore.getState().setScanning(true);
    await p2pRoomService.startScanning();
    
    // Poll for discovered rooms and update store
    this.pollDiscoveredRooms();
  }

  /**
   * Stop scanning for rooms
   */
  async stopScanning(): Promise<void> {
    useRoomStore.getState().setScanning(false);
    await p2pRoomService.stopScanning();
  }

  private pollDiscoveredRooms(): void {
    const interval = setInterval(() => {
      const isScanning = useRoomStore.getState().isScanning;
      if (!isScanning) {
        clearInterval(interval);
        return;
      }

      const rooms = p2pRoomService.getDiscoveredRooms();
      for (const room of rooms) {
        const legacyRoom = this.convertToLegacyDiscoveredRoom(room);
        useRoomStore.getState().addDiscoveredRoom(legacyRoom);
      }
    }, 1000);
  }

  /**
   * Join an existing room (Guest mode)
   */
  async joinRoom(room: LegacyDiscoveredRoom): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Convert legacy room to P2P format
    const p2pRoom: DiscoveredRoom = {
      roomId: room.roomId,
      roomName: room.roomName,
      hostPeerId: room.hostPeerId,
      hostName: room.hostName,
      peerCount: room.peerCount,
      createdAt: room.createdAt || Date.now(),
      lastSeen: room.lastSeen || Date.now(),
    };

    return await p2pRoomService.joinRoom(p2pRoom);
  }

  /**
   * Leave current room
   */
  async leaveRoom(): Promise<void> {
    await p2pRoomService.leaveRoom();
    useRoomStore.getState().leaveRoom();
  }

  /**
   * Check if in a room
   */
  isInRoom(): boolean {
    return p2pRoomService.isInRoom();
  }

  /**
   * Check if hosting
   */
  isHosting(): boolean {
    return p2pRoomService.isHosting();
  }

  // ============================================================================
  // FILE SHARING
  // ============================================================================

  /**
   * Check if we're in venue mode
   */
  private isVenueMode(): boolean {
    return venueLanTransport.isConnectedToVenue();
  }

  /**
   * Share files from local library
   */
  async shareFiles(files: LocalAudioFile[]): Promise<void> {
    const deviceId = useAppStore.getState().deviceId;
    const deviceName = useAppStore.getState().deviceName;
    
    console.log('[P2PAdapter] shareFiles called, files:', files.length);
    console.log('[P2PAdapter] isVenueMode:', this.isVenueMode());
    console.log('[P2PAdapter] venueConnectionState:', venueLanTransport.getConnectionState());

    // Check if we're in venue mode
    if (this.isVenueMode()) {
      // Share via Venue LAN transport
      const venueFiles = files.map((file) => ({
        id: file.id,
        title: file.title,
        artist: file.artist,
        album: file.album,
        duration: file.duration,
        size: file.size,
        mimeType: file.mimeType,
        sha256: file.sha256 || '',
        ownerPeerId: deviceId,
        ownerName: deviceName,
        addedAt: Date.now(),
      }));
      
      venueLanTransport.shareFiles(venueFiles);
      
      // Update local store
      for (const file of files) {
        await fileStorageService.setFileShared(file.id, true);
        useRoomStore.getState().shareMyFile({
          fileId: file.id,
          fileName: file.title,
          filePath: file.localPath,
          sizeBytes: file.size,
          mimeType: file.mimeType,
          durationSeconds: file.duration,
          artist: file.artist,
          album: file.album,
          sha256: file.sha256,
        });
      }
      
      console.log('[P2PAdapter] Shared', files.length, 'files via Venue');
      return;
    }

    // P2P mode
    for (const file of files) {
      // Mark as shared in storage
      await fileStorageService.setFileShared(file.id, true);

      // Convert to SharedFile format
      const sharedFile = fileStorageService.toSharedFile(file, deviceId, deviceName);

      // Share via P2P
      await p2pRoomService.shareFile(sharedFile, file.localPath);

      // Update local store
      useRoomStore.getState().shareMyFile({
        fileId: file.id,
        fileName: file.title,
        filePath: file.localPath,
        sizeBytes: file.size,
        mimeType: file.mimeType,
        durationSeconds: file.duration,
        artist: file.artist,
        album: file.album,
        sha256: file.sha256,
      });
    }
  }

  /**
   * Unshare a file
   */
  async unshareFile(fileId: string): Promise<void> {
    await fileStorageService.setFileShared(fileId, false);
    await p2pRoomService.unshareFile(fileId);
    useRoomStore.getState().unshareMyFile(fileId);
  }

  /**
   * Request to download a file
   */
  async requestFile(fileId: string): Promise<void> {
    const transferStore = useTransferStore.getState();
    const roomStore = useRoomStore.getState();

    // Check if we're in venue mode
    if (this.isVenueMode()) {
      // Find file in shared files from room store
      const sharedFiles = roomStore.sharedFiles || [];
      const file = sharedFiles.find(f => f.fileId === fileId);
      
      if (!file) {
        console.error('[P2PAdapter] Venue file not found:', fileId);
        return;
      }
      
      // Start transfer in store
      const transferId = transferStore.startTransfer({
        fileId: file.fileId,
        fileName: file.title,
        fileSize: file.sizeBytes,
        direction: TransferDirection.DOWNLOAD,
        peerId: file.ownerId,
        peerName: file.ownerName,
        state: TransferState.PENDING,
        transportMode: TransportMode.WIFI_LAN, // Venue uses WiFi
      });
      
      // Request file via venue relay
      venueLanTransport.requestFileRelay(fileId);
      
      console.log('[P2PAdapter] Requested file via Venue relay:', fileId);
      return;
    }

    // P2P mode
    const sharedFiles = p2pRoomService.getSharedFiles();
    const file = sharedFiles.find(f => f.id === fileId);
    
    if (!file) {
      console.error('[P2PAdapter] File not found:', fileId);
      return;
    }

    // Start transfer in store
    const transferId = transferStore.startTransfer({
      fileId: file.id,
      fileName: file.title,
      fileSize: file.size,
      direction: TransferDirection.DOWNLOAD,
      peerId: file.ownerPeerId,
      peerName: file.ownerName,
      state: TransferState.PENDING,
      transportMode: TransportMode.WIFI_LAN,
    });

    // Request file via P2P
    await p2pRoomService.requestFile(fileId);
  }

  // ============================================================================
  // CALLBACKS - Sync P2P events with stores
  // ============================================================================

  private handleRoomCreated(room: P2PRoomState): void {
    const roomInfo = this.convertToRoomInfo(room);
    useRoomStore.getState().createRoom(roomInfo);
  }

  private handleRoomJoined(room: P2PRoomState): void {
    const roomInfo = this.convertToRoomInfo(room);
    useRoomStore.getState().joinRoom(roomInfo);
  }

  private handleRoomLeft(): void {
    useRoomStore.getState().leaveRoom();
  }

  private handlePeerJoined(peer: RoomPeer): void {
    const peerInfo: PeerInfo = {
      peerId: peer.peerId,
      peerName: peer.displayName,
      sharedFileCount: peer.sharedFileCount,
      isOnline: true,
    };
    useRoomStore.getState().addPeer(peerInfo);
  }

  private handlePeerLeft(peerId: string): void {
    useRoomStore.getState().removePeer(peerId);
  }

  private handleFilesUpdated(files: SharedFile[]): void {
    const sharedFiles: SharedFileMetadata[] = files.map(f => ({
      fileId: f.id,
      fileName: f.title,
      sizeBytes: f.size,
      mimeType: f.mimeType,
      durationSeconds: f.duration,
      artist: f.artist,
      album: f.album,
      sha256: f.sha256,
      ownerId: f.ownerPeerId,
      ownerName: f.ownerName,
      addedAt: f.addedAt,
    }));
    useRoomStore.getState().updateSharedFiles(sharedFiles);
  }

  private handleFileRequest(fileId: string, fromPeerId: string): void {
    console.log('[P2PAdapter] File requested:', fileId, 'from:', fromPeerId);
    // Auto-accept handled by P2P service for MVP
  }

  private handleTransferProgress(progress: TransferProgress): void {
    const transferStore = useTransferStore.getState();
    
    // Find transfer by fileId embedded in transferId
    const transfers = transferStore.transfers;
    const transfer = transfers.find(t => 
      t.transferId.includes(progress.transferId) ||
      progress.transferId.includes(t.transferId)
    );
    
    if (transfer) {
      if (progress.state === 'completed') {
        transferStore.completeTransfer(transfer.transferId);
      } else if (progress.state === 'failed') {
        transferStore.failTransfer(transfer.transferId, progress.error || 'Transfer failed');
      } else {
        transferStore.updateProgress(
          transfer.transferId,
          progress.bytesTransferred,
          progress.speed
        );
      }
    }
  }

  private async handleFileReceived(file: ReceivedFile): Promise<void> {
    console.log('[P2PAdapter] File received:', file.meta.fileName);

    // Verify checksum
    const isValid = await fileStorageService.verifyChecksum(
      file.tempFilePath,
      file.meta.sha256
    );

    if (!isValid) {
      console.error('[P2PAdapter] Checksum mismatch for:', file.meta.fileName);
      useTransferStore.getState().failTransfer(file.transferId, 'Checksum mismatch');
      return;
    }

    // Save to library
    const localFile = await fileStorageService.saveReceivedFile(file.tempFilePath, {
      title: file.meta.fileName,
      mimeType: file.meta.mimeType,
    });

    if (localFile) {
      console.log('[P2PAdapter] File saved to library:', localFile.title);
    }

    // Complete transfer
    useTransferStore.getState().completeTransfer(file.transferId);
  }

  private handleError(error: string): void {
    console.error('[P2PAdapter] Error:', error);
  }

  // ============================================================================
  // CONVERTERS
  // ============================================================================

  private convertToRoomInfo(room: P2PRoomState): RoomInfo {
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      hostPeerId: room.hostPeerId,
      hostName: room.hostName,
      createdAt: room.createdAt,
      wifiAvailable: true, // P2P doesn't distinguish
      peerCount: room.peers.length,
    };
  }

  private convertToLegacyDiscoveredRoom(room: DiscoveredRoom): LegacyDiscoveredRoom {
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      hostPeerId: room.hostPeerId,
      hostName: room.hostName,
      peerCount: room.peerCount,
      createdAt: room.createdAt,
      lastSeen: room.lastSeen,
      rssi: room.signalStrength || -50,
    };
  }
}

// Export singleton instance
export const p2pRoomServiceAdapter = new P2PRoomServiceAdapter();
export default p2pRoomServiceAdapter;

