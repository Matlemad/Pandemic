/**
 * Network Service - Local Wi-Fi LAN Communication
 * 
 * This service handles:
 * - Getting local IP address
 * - HTTP server for file transfers
 * - WebSocket server for real-time coordination
 * 
 * All communication is local-only, no Internet required.
 */

import * as Network from 'expo-network';
import {
  NetworkCapabilities,
  TransportMode,
  MessageType,
  BaseMessage,
  RoomStateMessage,
  PeerInfo,
  SharedFileMetadata,
  RoomInfo,
} from '../types';

// Default ports
const HTTP_PORT = 8080;
const WS_PORT = 8081;

export interface NetworkServiceCallbacks {
  onPeerConnected: (peer: PeerInfo) => void;
  onPeerDisconnected: (peerId: string) => void;
  onMessage: (message: BaseMessage) => void;
  onError: (error: Error) => void;
}

class NetworkService {
  private isInitialized = false;
  private localIpAddress: string | null = null;
  private callbacks: NetworkServiceCallbacks | null = null;
  
  // Simulated connections for MVP
  private connectedPeers: Map<string, { peer: PeerInfo; socket: any }> = new Map();

  /**
   * Initialize network service and detect capabilities
   */
  async initialize(): Promise<NetworkCapabilities> {
    try {
      // Get network state
      const networkState = await Network.getNetworkStateAsync();
      const ipAddress = await Network.getIpAddressAsync();

      this.localIpAddress = ipAddress;
      this.isInitialized = true;

      const wifiAvailable = networkState.type === Network.NetworkStateType.WIFI;

      return {
        bleAvailable: true, // Assume BLE is available, checked separately
        wifiAvailable,
        localIpAddress: wifiAvailable ? ipAddress : null,
        transportMode: wifiAvailable ? TransportMode.WIFI_LAN : TransportMode.BLE_ONLY,
      };
    } catch (error) {
      console.error('Network initialization failed:', error);
      return {
        bleAvailable: true,
        wifiAvailable: false,
        localIpAddress: null,
        transportMode: TransportMode.BLE_ONLY,
      };
    }
  }

  /**
   * Set callbacks for network events
   */
  setCallbacks(callbacks: NetworkServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get local IP address
   */
  async getLocalIpAddress(): Promise<string | null> {
    if (this.localIpAddress) return this.localIpAddress;
    
    try {
      this.localIpAddress = await Network.getIpAddressAsync();
      return this.localIpAddress;
    } catch {
      return null;
    }
  }

  /**
   * Get full host address (IP:port)
   */
  async getHostAddress(): Promise<string | null> {
    const ip = await this.getLocalIpAddress();
    if (!ip) return null;
    return `${ip}:${HTTP_PORT}`;
  }

  /**
   * Check if device is connected to Wi-Fi
   */
  async isWifiConnected(): Promise<boolean> {
    try {
      const state = await Network.getNetworkStateAsync();
      return state.type === Network.NetworkStateType.WIFI;
    } catch {
      return false;
    }
  }

  /**
   * Start HTTP server for file transfers (host mode)
   * 
   * Note: React Native doesn't have a built-in HTTP server.
   * In production, we would use a native module like:
   * - react-native-http-bridge
   * - react-native-http-server
   * 
   * For MVP, we simulate this functionality.
   */
  async startHttpServer(): Promise<string | null> {
    const hostAddress = await this.getHostAddress();
    if (!hostAddress) {
      console.warn('Cannot start HTTP server: no local IP');
      return null;
    }

    console.log(`HTTP server would start at http://${hostAddress}`);
    
    // In production, implement actual HTTP server
    // For now, return the address
    return hostAddress;
  }

  /**
   * Stop HTTP server
   */
  stopHttpServer(): void {
    console.log('HTTP server stopped');
    // Cleanup server resources
  }

  /**
   * Connect to a host's WebSocket server
   */
  async connectToHost(
    hostAddress: string,
    sessionToken: string,
    peerId: string,
    peerName: string
  ): Promise<boolean> {
    try {
      // In production, create actual WebSocket connection
      // const ws = new WebSocket(`ws://${hostAddress}/room`);
      
      console.log(`Connecting to host at ${hostAddress}`);
      
      // Simulate successful connection
      return true;
    } catch (error) {
      console.error('Failed to connect to host:', error);
      return false;
    }
  }

  /**
   * Disconnect from host
   */
  disconnectFromHost(): void {
    this.connectedPeers.clear();
    console.log('Disconnected from host');
  }

  /**
   * Send message to host or broadcast to all peers
   */
  sendMessage(message: BaseMessage): void {
    console.log('Sending message:', message.type);
    // In production, send via WebSocket
  }

  /**
   * Download file from peer via HTTP
   */
  async downloadFile(
    ownerAddress: string,
    fileId: string,
    onProgress: (progress: number) => void
  ): Promise<string | null> {
    const url = `http://${ownerAddress}/files/${fileId}`;
    
    console.log(`Downloading file from ${url}`);
    
    // In production, use fetch with streaming:
    // const response = await fetch(url);
    // const reader = response.body?.getReader();
    // ... stream to file
    
    // Simulate download progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      onProgress(i);
    }
    
    // Return local path where file was saved
    return null; // Would return actual path
  }

  /**
   * Get connected peers
   */
  getConnectedPeers(): PeerInfo[] {
    return Array.from(this.connectedPeers.values()).map(p => p.peer);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHttpServer();
    this.disconnectFromHost();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const networkService = new NetworkService();
export default networkService;

