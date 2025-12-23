/**
 * Room Service - Room Lifecycle & Coordination
 * 
 * This service orchestrates:
 * - Room creation and hosting
 * - Room discovery and joining
 * - Peer management
 * - File sharing coordination
 */

import {
  RoomInfo,
  RoomRole,
  PeerInfo,
  SharedFileMetadata,
  AudioFileMetadata,
  DiscoveredRoom,
  ConnectionState,
  BleAdvertisement,
  MessageType,
  TransportMode,
} from '../types';
import { generateId, generateRoomCode, generateSessionToken } from '../utils/id';
import bleService from './BleService';
import networkService from './NetworkService';
import { useRoomStore } from '../stores/roomStore';
import { useAppStore } from '../stores/appStore';

class RoomService {
  private currentRoom: RoomInfo | null = null;
  private currentRole: RoomRole | null = null;
  private sessionToken: string | null = null;
  private hostAddress: string | null = null;

  // Pending join requests (for hosts)
  private pendingJoins: Map<string, (accept: boolean) => void> = new Map();

  /**
   * Create and host a new room
   */
  async createRoom(roomName: string): Promise<RoomInfo | null> {
    const appStore = useAppStore.getState();
    const roomStore = useRoomStore.getState();

    try {
      // Initialize network
      const networkCaps = await networkService.initialize();
      appStore.updateNetworkCapabilities(networkCaps);

      // Generate room data
      const roomId = generateId();
      const hostAddress = await networkService.getHostAddress();

      const room: RoomInfo = {
        roomId,
        roomName: roomName || `Room-${generateRoomCode()}`,
        hostId: appStore.deviceId,
        hostName: appStore.deviceName,
        hostAddress,
        wifiAvailable: networkCaps.wifiAvailable,
        peerCount: 0,
        createdAt: Date.now(),
      };

      // Start HTTP server for file transfers
      if (networkCaps.wifiAvailable) {
        await networkService.startHttpServer();
      }

      // Initialize BLE
      await bleService.initialize();

      // Set up BLE callbacks for incoming connections
      bleService.setCallbacks({
        onRoomDiscovered: () => {}, // Not used when hosting
        onRoomLost: () => {},
        onJoinRequest: async (request) => {
          // Handle incoming join request
          console.log('Join request from:', request.peerName);
          
          // Auto-accept for MVP
          const newPeer: PeerInfo = {
            peerId: request.peerId,
            peerName: request.peerName,
            address: null, // Will be updated when they connect via LAN
            joinedAt: Date.now(),
            sharedFileCount: 0,
            isOnline: true,
          };

          roomStore.addPeer(newPeer);

          return {
            success: true,
            sessionToken: generateSessionToken(),
            hostAddress: room.hostAddress,
            roomName: room.roomName, // Include full room name
            error: null,
          };
        },
        onError: (error) => {
          console.error('BLE error:', error);
        },
      });

      // Start BLE advertising
      const advertisement: BleAdvertisement = {
        roomId: room.roomId,
        roomName: room.roomName,
        hostId: room.hostId,
        hostName: room.hostName,
        wifiAvailable: room.wifiAvailable,
        hostAddress: room.hostAddress,
        version: 1,
      };
      await bleService.startAdvertising(advertisement);

      // Update stores
      this.currentRoom = room;
      this.currentRole = RoomRole.HOST;
      roomStore.createRoom(room);

      return room;
    } catch (error) {
      console.error('Failed to create room:', error);
      roomStore.setConnectionState(ConnectionState.ERROR);
      return null;
    }
  }

  /**
   * Start scanning for nearby rooms
   */
  async startScanning(): Promise<void> {
    const roomStore = useRoomStore.getState();

    try {
      await bleService.initialize();

      bleService.setCallbacks({
        onRoomDiscovered: (room) => {
          roomStore.addDiscoveredRoom(room);
        },
        onRoomLost: (roomId) => {
          roomStore.removeDiscoveredRoom(roomId);
        },
        onJoinRequest: async () => ({
          success: false,
          sessionToken: null,
          hostAddress: null,
          error: 'Non in modalità host',
        }),
        onError: (error) => {
          console.error('Scan error:', error);
        },
      });

      roomStore.setScanning(true);
      await bleService.startScanning();
    } catch (error) {
      console.error('Failed to start scanning:', error);
      roomStore.setScanning(false);
    }
  }

  /**
   * Stop scanning for rooms
   */
  stopScanning(): void {
    const roomStore = useRoomStore.getState();
    bleService.stopScanning();
    roomStore.setScanning(false);
  }

  /**
   * Join an existing room
   */
  async joinRoom(room: DiscoveredRoom): Promise<boolean> {
    const appStore = useAppStore.getState();
    const roomStore = useRoomStore.getState();

    try {
      roomStore.setConnectionState(ConnectionState.CONNECTING);

      // Stop scanning
      this.stopScanning();

      // Perform BLE handshake
      const response = await bleService.joinRoom(
        room,
        appStore.deviceId,
        appStore.deviceName
      );

      if (!response.success) {
        console.error('Join failed:', response.error);
        roomStore.setConnectionState(ConnectionState.ERROR);
        return false;
      }

      this.sessionToken = response.sessionToken;
      this.hostAddress = response.hostAddress;

      // Create room info - use roomName from response if available (full name from host)
      const roomInfo: RoomInfo = {
        roomId: room.roomId,
        roomName: response.roomName || room.roomName, // Use full name from host response
        hostId: room.hostId,
        hostName: room.hostName,
        hostAddress: response.hostAddress || room.hostAddress,
        wifiAvailable: room.wifiAvailable,
        peerCount: room.peerCount,
        createdAt: room.createdAt,
      };

      // If Wi-Fi is available, connect via LAN
      if (room.wifiAvailable && roomInfo.hostAddress) {
        const connected = await networkService.connectToHost(
          roomInfo.hostAddress,
          this.sessionToken!,
          appStore.deviceId,
          appStore.deviceName
        );

        if (!connected) {
          console.warn('LAN connection failed, using BLE-only mode');
          appStore.updateNetworkCapabilities({
            wifiAvailable: false,
            transportMode: TransportMode.BLE_ONLY,
          });
        } else {
          // After connecting via LAN, synchronize shared files from host
          await this.syncSharedFilesFromHost();
        }
      }

      // Update stores
      this.currentRoom = roomInfo;
      this.currentRole = RoomRole.GUEST;
      roomStore.joinRoom(roomInfo);
      roomStore.setConnectionState(ConnectionState.CONNECTED);

      return true;
    } catch (error) {
      console.error('Failed to join room:', error);
      roomStore.setConnectionState(ConnectionState.ERROR);
      return false;
    }
  }

  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    const roomStore = useRoomStore.getState();

    if (this.currentRole === RoomRole.HOST) {
      // Notify all peers that room is closing
      await bleService.stopAdvertising();
      networkService.stopHttpServer();
    } else {
      // Disconnect from host
      networkService.disconnectFromHost();
    }

    this.currentRoom = null;
    this.currentRole = null;
    this.sessionToken = null;
    this.hostAddress = null;

    roomStore.leaveRoom();
  }

  /**
   * Share files in the current room
   */
  shareFiles(files: AudioFileMetadata[]): void {
    const roomStore = useRoomStore.getState();
    const appStore = useAppStore.getState();

    for (const file of files) {
      roomStore.shareMyFile(file);

      // Create shared file metadata
      const sharedFile: SharedFileMetadata = {
        ...file,
        ownerId: appStore.deviceId,
        ownerName: appStore.deviceName,
        ownerAddress: appStore.networkCapabilities.localIpAddress,
        isSharedByMe: true,
      };

      roomStore.addSharedFile(sharedFile);
    }

    // Broadcast to room
    // networkService.sendMessage({
    //   type: MessageType.SHARE_FILES,
    //   files,
    //   senderId: appStore.deviceId,
    //   timestamp: Date.now(),
    // });
  }

  /**
   * Unshare files
   */
  unshareFiles(fileIds: string[]): void {
    const roomStore = useRoomStore.getState();

    for (const fileId of fileIds) {
      roomStore.unshareMyFile(fileId);
      roomStore.removeSharedFile(fileId);
    }
  }

  /**
   * Sync shared files from host (guest mode)
   * In production, this would be a WebSocket/HTTP request
   * 
   * For now, this is a placeholder. In a real implementation:
   * 1. Guest requests file list from host via HTTP/WebSocket
   * 2. Host responds with list of SharedFileMetadata from roomStore.sharedFiles
   * 3. Guest adds these files to their roomStore.sharedFiles
   */
  private async syncSharedFilesFromHost(): Promise<void> {
    const roomStore = useRoomStore.getState();
    
    if (this.currentRole !== RoomRole.GUEST || !this.hostAddress) {
      return;
    }

    console.log('Syncing shared files from host...');
    console.log('⚠️ File sync not yet implemented - files will be synchronized via WebSocket in production');
    
    // TODO: In production, make HTTP/WebSocket request to host:
    // const response = await fetch(`http://${this.hostAddress}/api/files`);
    // const files: SharedFileMetadata[] = await response.json();
    // roomStore.updateSharedFiles(files);
    
    // For MVP: Files will be synchronized via WebSocket messages
    // when a guest joins, the host should send INDEX_UPDATED message
    // with all shared files. For now, this is a placeholder.
  }

  /**
   * Get current room info
   */
  getCurrentRoom(): RoomInfo | null {
    return this.currentRoom;
  }

  /**
   * Get current role
   */
  getCurrentRole(): RoomRole | null {
    return this.currentRole;
  }

  /**
   * Check if user is hosting
   */
  isHosting(): boolean {
    return this.currentRole === RoomRole.HOST;
  }

  /**
   * Check if user is in a room
   */
  isInRoom(): boolean {
    return this.currentRoom !== null;
  }
}

// Export singleton instance
export const roomService = new RoomService();
export default roomService;

