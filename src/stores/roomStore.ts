/**
 * Room State Store - Zustand
 */

import { create } from 'zustand';
import {
  RoomInfo,
  RoomRole,
  RoomState,
  PeerInfo,
  SharedFileMetadata,
  ConnectionState,
  DiscoveredRoom,
  AudioFileMetadata,
  PeerId,
} from '../types';

interface RoomStore extends RoomState {
  // Discovery
  discoveredRooms: DiscoveredRoom[];
  isScanning: boolean;

  // My shared files
  mySharedFiles: AudioFileMetadata[];

  // Actions - Room lifecycle
  createRoom: (room: RoomInfo) => void;
  joinRoom: (room: RoomInfo) => void;
  leaveRoom: () => void;
  closeRoom: () => void;

  // Actions - Discovery
  setScanning: (scanning: boolean) => void;
  addDiscoveredRoom: (room: DiscoveredRoom) => void;
  removeDiscoveredRoom: (roomId: string) => void;
  clearDiscoveredRooms: () => void;
  updateDiscoveredRoom: (roomId: string, updates: Partial<DiscoveredRoom>) => void;

  // Actions - Peers
  addPeer: (peer: PeerInfo) => void;
  removePeer: (peerId: string) => void;
  updatePeer: (peerId: string, updates: Partial<PeerInfo>) => void;

  // Actions - Files
  addSharedFile: (file: SharedFileMetadata) => void;
  removeSharedFile: (fileId: string) => void;
  updateSharedFiles: (files: SharedFileMetadata[]) => void;
  shareMyFile: (file: AudioFileMetadata) => void;
  unshareMyFile: (fileId: string) => void;

  // Actions - Connection
  setConnectionState: (state: ConnectionState) => void;
}

const initialState: RoomState = {
  room: null,
  role: null,
  peers: [],
  sharedFiles: [],
  connectionState: ConnectionState.DISCONNECTED,
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  ...initialState,
  discoveredRooms: [],
  isScanning: false,
  mySharedFiles: [],

  // Room lifecycle
  createRoom: (room: RoomInfo) => {
    set({
      room,
      role: RoomRole.HOST,
      peers: [],
      sharedFiles: [],
      connectionState: ConnectionState.CONNECTED,
    });
  },

  joinRoom: (room: RoomInfo) => {
    set({
      room,
      role: RoomRole.GUEST,
      peers: [],
      sharedFiles: [],
      connectionState: ConnectionState.CONNECTING,
    });
  },

  leaveRoom: () => {
    set({
      ...initialState,
      discoveredRooms: get().discoveredRooms,
      mySharedFiles: get().mySharedFiles,
    });
  },

  closeRoom: () => {
    set({
      ...initialState,
      discoveredRooms: [],
      mySharedFiles: get().mySharedFiles,
    });
  },

  // Discovery
  setScanning: (scanning: boolean) => set({ isScanning: scanning }),

  addDiscoveredRoom: (room: DiscoveredRoom) => {
    const existing = get().discoveredRooms;
    const index = existing.findIndex((r) => r.roomId === room.roomId);
    if (index >= 0) {
      // Update existing
      const updated = [...existing];
      updated[index] = { ...updated[index], ...room, lastSeen: Date.now() };
      set({ discoveredRooms: updated });
    } else {
      // Add new
      set({ discoveredRooms: [...existing, { ...room, lastSeen: Date.now() }] });
    }
  },

  removeDiscoveredRoom: (roomId: string) => {
    set({
      discoveredRooms: get().discoveredRooms.filter((r) => r.roomId !== roomId),
    });
  },

  clearDiscoveredRooms: () => set({ discoveredRooms: [] }),

  updateDiscoveredRoom: (roomId: string, updates: Partial<DiscoveredRoom>) => {
    const rooms = get().discoveredRooms.map((r) =>
      r.roomId === roomId ? { ...r, ...updates } : r
    );
    set({ discoveredRooms: rooms });
  },

  // Peers
  addPeer: (peer: PeerInfo) => {
    const existing = get().peers;
    if (!existing.find((p) => p.peerId === peer.peerId)) {
      set({ peers: [...existing, peer] });
    }
  },

  removePeer: (peerId: string) => {
    set({
      peers: get().peers.filter((p) => p.peerId !== peerId),
      // Also remove their shared files
      sharedFiles: get().sharedFiles.filter((f) => f.ownerId !== peerId),
    });
  },

  updatePeer: (peerId: string, updates: Partial<PeerInfo>) => {
    set({
      peers: get().peers.map((p) =>
        p.peerId === peerId ? { ...p, ...updates } : p
      ),
    });
  },

  // Files
  addSharedFile: (file: SharedFileMetadata) => {
    const existing = get().sharedFiles;
    if (!existing.find((f) => f.fileId === file.fileId)) {
      set({ sharedFiles: [...existing, file] });
    }
  },

  removeSharedFile: (fileId: string) => {
    set({
      sharedFiles: get().sharedFiles.filter((f) => f.fileId !== fileId),
    });
  },

  updateSharedFiles: (files: SharedFileMetadata[]) => {
    set({ sharedFiles: files });
  },

  shareMyFile: (file: AudioFileMetadata) => {
    const existing = get().mySharedFiles;
    if (!existing.find((f) => f.fileId === file.fileId)) {
      set({ mySharedFiles: [...existing, file] });
    }
  },

  unshareMyFile: (fileId: string) => {
    set({
      mySharedFiles: get().mySharedFiles.filter((f) => f.fileId !== fileId),
    });
  },

  // Connection
  setConnectionState: (state: ConnectionState) => {
    set({ connectionState: state });
  },
}));

