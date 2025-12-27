/**
 * Library Store - Persistent audio library with ordering and playback state
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/id';

// ============================================================================
// TYPES
// ============================================================================

export type TrackSource = 'imported' | 'downloaded';

export interface LibraryTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  mimeType?: string;
  localUri: string;
  source: TrackSource;
  createdAt: number;
  orderIndex: number;
  size?: number;
  sha256?: string;
}

export interface PlaybackState {
  currentTrackId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

interface LibraryState {
  tracks: LibraryTrack[];
  playback: PlaybackState;
  isLoaded: boolean;
  
  // Actions
  loadLibrary: () => Promise<void>;
  addTrack: (track: Omit<LibraryTrack, 'id' | 'orderIndex' | 'createdAt'>) => Promise<LibraryTrack>;
  removeTrack: (trackId: string) => Promise<void>;
  reorderTracks: (orderedIds: string[]) => Promise<void>;
  getTrackById: (trackId: string) => LibraryTrack | undefined;
  
  // Playback actions
  setCurrentTrack: (trackId: string | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPosition: (positionMs: number) => void;
  setDuration: (durationMs: number) => void;
  getNextTrack: () => LibraryTrack | null;
  getPreviousTrack: () => LibraryTrack | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = '@pandemic_library_tracks';

// ============================================================================
// STORE
// ============================================================================

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  playback: {
    currentTrackId: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
  },
  isLoaded: false,

  loadLibrary: async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const tracks = JSON.parse(json) as LibraryTrack[];
        // Sort by orderIndex
        tracks.sort((a, b) => a.orderIndex - b.orderIndex);
        set({ tracks, isLoaded: true });
      } else {
        set({ tracks: [], isLoaded: true });
      }
    } catch (error) {
      console.error('[LibraryStore] Failed to load:', error);
      set({ tracks: [], isLoaded: true });
    }
  },

  addTrack: async (trackData) => {
    const { tracks } = get();
    
    const newTrack: LibraryTrack = {
      ...trackData,
      id: generateId(),
      orderIndex: tracks.length,
      createdAt: Date.now(),
    };

    const updatedTracks = [...tracks, newTrack];
    
    set({ tracks: updatedTracks });
    
    // Persist
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTracks));
    } catch (error) {
      console.error('[LibraryStore] Failed to save:', error);
    }

    return newTrack;
  },

  removeTrack: async (trackId) => {
    const { tracks } = get();
    const updatedTracks = tracks
      .filter((t) => t.id !== trackId)
      .map((t, index) => ({ ...t, orderIndex: index }));

    set({ tracks: updatedTracks });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTracks));
    } catch (error) {
      console.error('[LibraryStore] Failed to save after remove:', error);
    }
  },

  reorderTracks: async (orderedIds) => {
    const { tracks } = get();
    
    const reorderedTracks = orderedIds
      .map((id, index) => {
        const track = tracks.find((t) => t.id === id);
        if (!track) return null;
        return { ...track, orderIndex: index };
      })
      .filter((t): t is LibraryTrack => t !== null);

    set({ tracks: reorderedTracks });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reorderedTracks));
    } catch (error) {
      console.error('[LibraryStore] Failed to save after reorder:', error);
    }
  },

  getTrackById: (trackId) => {
    return get().tracks.find((t) => t.id === trackId);
  },

  setCurrentTrack: (trackId) => {
    set((state) => ({
      playback: { ...state.playback, currentTrackId: trackId, positionMs: 0 },
    }));
  },

  setIsPlaying: (isPlaying) => {
    set((state) => ({
      playback: { ...state.playback, isPlaying },
    }));
  },

  setPosition: (positionMs) => {
    set((state) => ({
      playback: { ...state.playback, positionMs },
    }));
  },

  setDuration: (durationMs) => {
    set((state) => ({
      playback: { ...state.playback, durationMs },
    }));
  },

  getNextTrack: () => {
    const { tracks, playback } = get();
    if (!playback.currentTrackId || tracks.length === 0) {
      return tracks[0] || null;
    }

    const currentIndex = tracks.findIndex((t) => t.id === playback.currentTrackId);
    if (currentIndex === -1 || currentIndex >= tracks.length - 1) {
      return null; // End of playlist
    }

    return tracks[currentIndex + 1];
  },

  getPreviousTrack: () => {
    const { tracks, playback } = get();
    if (!playback.currentTrackId || tracks.length === 0) {
      return null;
    }

    const currentIndex = tracks.findIndex((t) => t.id === playback.currentTrackId);
    if (currentIndex <= 0) {
      return null;
    }

    return tracks[currentIndex - 1];
  },
}));

