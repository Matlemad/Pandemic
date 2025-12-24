/**
 * Android P2P Transport — Google Nearby Connections implementation
 * 
 * This module wraps the native NearbyConnectionsModule for Android.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
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
  ConnectionState,
  TransferState,
  TransferDirection,
  DEFAULT_P2P_CONFIG,
} from './types';
import { BaseP2PTransport } from './transport.base';
import { p2pEvents } from './events';

const { NearbyConnectionsModule } = NativeModules;

/**
 * Check if the native module is available
 */
export const isNearbyConnectionsAvailable = 
  Platform.OS === 'android' && NearbyConnectionsModule != null;

/**
 * Android P2P Transport using Google Nearby Connections API
 */
export class AndroidP2PTransport extends BaseP2PTransport {
  private nativeEventEmitter: NativeEventEmitter | null = null;
  private eventSubscriptions: Array<{ remove: () => void }> = [];

  constructor() {
    super();
    
    if (!isNearbyConnectionsAvailable) {
      console.warn('[AndroidP2P] NearbyConnectionsModule not available');
      return;
    }
    
    this.nativeEventEmitter = new NativeEventEmitter(NearbyConnectionsModule);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.nativeEventEmitter) return;

    // Discovery events
    this.subscribeToNativeEvent('p2p_room_found', (data) => {
      const room: DiscoveredRoom = {
        roomId: data.roomId,
        roomName: data.roomName,
        hostPeerId: data.hostPeerId,
        hostName: data.hostName,
        peerCount: data.peerCount || 0,
        createdAt: data.createdAt || Date.now(),
        lastSeen: data.lastSeen || Date.now(),
        signalStrength: data.signalStrength,
      };
      this.addDiscoveredRoom(room);
    });

    this.subscribeToNativeEvent('p2p_room_lost', (data) => {
      this.removeDiscoveredRoom(data.roomId);
    });

    this.subscribeToNativeEvent('p2p_discovery_started', () => {
      this._isDiscovering = true;
      this.emit(P2PEventType.DISCOVERY_STARTED, undefined as never);
    });

    this.subscribeToNativeEvent('p2p_discovery_stopped', () => {
      this._isDiscovering = false;
      this.emit(P2PEventType.DISCOVERY_STOPPED, undefined as never);
    });

    // Advertising events
    this.subscribeToNativeEvent('p2p_advertising_started', () => {
      this._isAdvertising = true;
      this.emit(P2PEventType.ADVERTISING_STARTED, undefined as never);
    });

    this.subscribeToNativeEvent('p2p_advertising_stopped', () => {
      this._isAdvertising = false;
      this.emit(P2PEventType.ADVERTISING_STOPPED, undefined as never);
    });

    // Connection events
    this.subscribeToNativeEvent('p2p_peer_connecting', (data) => {
      this.emit(P2PEventType.PEER_CONNECTING, {
        peerId: data.peerId,
        displayName: data.displayName,
      });
    });

    this.subscribeToNativeEvent('p2p_peer_connected', (data) => {
      const peer: ConnectedPeer = {
        peerId: data.peerId,
        displayName: data.displayName,
        connectionState: ConnectionState.CONNECTED,
        connectedAt: data.connectedAt || Date.now(),
      };
      this.addConnectedPeer(peer);
    });

    this.subscribeToNativeEvent('p2p_peer_disconnected', (data) => {
      this.removeConnectedPeer(data.peerId);
    });

    this.subscribeToNativeEvent('p2p_connection_failed', (data) => {
      this.emit(P2PEventType.CONNECTION_FAILED, {
        peerId: data.peerId,
        error: data.error || 'Connection failed',
      });
    });

    // Data events
    this.subscribeToNativeEvent('p2p_bytes_received', (data) => {
      this.emit(P2PEventType.BYTES_RECEIVED, {
        fromPeerId: data.fromPeerId,
        typeTag: data.typeTag,
        data: data.data,
      });
    });

    this.subscribeToNativeEvent('p2p_file_received', (data) => {
      // Parse meta if it's a string
      let meta: FileTransferMeta;
      try {
        const metaObj = typeof data.meta === 'string' ? JSON.parse(data.meta) : data.meta;
        meta = {
          fileId: metaObj.fileId || '',
          fileName: metaObj.fileName || 'unknown',
          mimeType: metaObj.mimeType || 'audio/*',
          sizeBytes: metaObj.sizeBytes || 0,
          sha256: metaObj.sha256 || '',
        };
      } catch {
        meta = {
          fileId: '',
          fileName: 'unknown',
          mimeType: 'audio/*',
          sizeBytes: 0,
          sha256: '',
        };
      }

      this.emit(P2PEventType.FILE_RECEIVED, {
        fromPeerId: data.fromPeerId || '',
        transferId: data.transferId,
        tempFilePath: data.tempFilePath,
        meta,
      });
    });

    this.subscribeToNativeEvent('p2p_transfer_progress', (data) => {
      const progress: TransferProgress = {
        transferId: data.transferId,
        direction: data.direction === 'incoming' ? TransferDirection.INCOMING : TransferDirection.OUTGOING,
        state: this.mapTransferState(data.state),
        bytesTransferred: data.bytesTransferred || 0,
        totalBytes: data.totalBytes || 0,
        progress: data.progress || 0,
        speed: data.speed || 0,
        eta: data.eta || null,
        error: data.error,
      };
      this.updateTransferProgress(progress);
    });

    // Error events
    this.subscribeToNativeEvent('p2p_error', (data) => {
      this.emit(P2PEventType.ERROR, {
        code: data.code || 'UNKNOWN',
        message: data.message || 'Unknown error',
      });
    });
  }

  private subscribeToNativeEvent(eventName: string, handler: (data: any) => void): void {
    if (!this.nativeEventEmitter) return;
    
    const subscription = this.nativeEventEmitter.addListener(eventName, handler);
    this.eventSubscriptions.push(subscription);
  }

  private mapTransferState(state: string): TransferState {
    switch (state) {
      case 'pending': return TransferState.PENDING;
      case 'in_progress': return TransferState.IN_PROGRESS;
      case 'completed': return TransferState.COMPLETED;
      case 'failed': return TransferState.FAILED;
      case 'cancelled': return TransferState.CANCELLED;
      default: return TransferState.PENDING;
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(config: P2PConfig): Promise<void> {
    if (!isNearbyConnectionsAvailable) {
      throw new P2PError(P2PErrorCode.NOT_SUPPORTED, 'Nearby Connections not available');
    }

    this.config = { ...DEFAULT_P2P_CONFIG, ...config };
    this.displayName = config.displayName;

    await NearbyConnectionsModule.initialize({
      serviceId: this.config.serviceId,
      displayName: this.displayName,
    });

    // Generate local peer ID (we'll get this from the module in a future version)
    this.localPeerId = `android-${Date.now()}`;
    
    console.log('[AndroidP2P] Initialized');
  }

  async destroy(): Promise<void> {
    // Remove all event subscriptions
    for (const subscription of this.eventSubscriptions) {
      subscription.remove();
    }
    this.eventSubscriptions = [];

    if (isNearbyConnectionsAvailable) {
      await NearbyConnectionsModule.destroy();
    }

    this.discoveredRooms.clear();
    this.connectedPeers.clear();
    this.transfers.clear();
    
    console.log('[AndroidP2P] Destroyed');
  }

  async isAvailable(): Promise<boolean> {
    if (!isNearbyConnectionsAvailable) return false;
    return await NearbyConnectionsModule.isAvailable();
  }

  async requestPermissions(): Promise<boolean> {
    if (!isNearbyConnectionsAvailable) return false;
    
    const result = await NearbyConnectionsModule.checkPermissions();
    return result.allGranted;
  }

  // ============================================================================
  // DISCOVERY
  // ============================================================================

  async startDiscovery(): Promise<void> {
    if (!isNearbyConnectionsAvailable) {
      throw new P2PError(P2PErrorCode.NOT_SUPPORTED, 'Nearby Connections not available');
    }

    await NearbyConnectionsModule.startDiscovery();
  }

  async stopDiscovery(): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.stopDiscovery();
  }

  // ============================================================================
  // ADVERTISING
  // ============================================================================

  async startAdvertising(room: RoomAdvertisement): Promise<void> {
    if (!isNearbyConnectionsAvailable) {
      throw new P2PError(P2PErrorCode.NOT_SUPPORTED, 'Nearby Connections not available');
    }

    await NearbyConnectionsModule.startAdvertising({
      roomId: room.roomId,
      roomName: room.roomName,
      hostName: room.hostName,
      peerCount: room.peerCount,
      createdAt: room.createdAt,
    });
  }

  async stopAdvertising(): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.stopAdvertising();
  }

  // ============================================================================
  // CONNECTION
  // ============================================================================

  async connectToHost(hostPeerId: PeerId): Promise<void> {
    if (!isNearbyConnectionsAvailable) {
      throw new P2PError(P2PErrorCode.NOT_SUPPORTED, 'Nearby Connections not available');
    }

    await NearbyConnectionsModule.connectToHost(hostPeerId);
  }

  async acceptConnection(peerId: PeerId): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.acceptConnection(peerId);
  }

  async rejectConnection(peerId: PeerId): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.rejectConnection(peerId);
  }

  async disconnectFromPeer(peerId: PeerId): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.disconnectFromPeer(peerId);
  }

  async disconnectAll(): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.disconnectAll();
  }

  // ============================================================================
  // DATA TRANSFER
  // ============================================================================

  async sendBytes(toPeerId: PeerId, data: string, typeTag: string): Promise<boolean> {
    if (!isNearbyConnectionsAvailable) return false;
    return await NearbyConnectionsModule.sendBytes(toPeerId, data, typeTag);
  }

  async sendFile(
    toPeerId: PeerId,
    fileUri: string,
    meta: FileTransferMeta
  ): Promise<TransferId> {
    if (!isNearbyConnectionsAvailable) {
      throw new P2PError(P2PErrorCode.NOT_SUPPORTED, 'Nearby Connections not available');
    }

    return await NearbyConnectionsModule.sendFile(toPeerId, fileUri, {
      fileId: meta.fileId,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      sha256: meta.sha256,
    });
  }

  async cancelTransfer(transferId: TransferId): Promise<void> {
    if (!isNearbyConnectionsAvailable) return;
    await NearbyConnectionsModule.cancelTransfer(transferId);
  }
}

// Export singleton instance
export const androidP2PTransport = new AndroidP2PTransport();
export default androidP2PTransport;

