/**
 * Transfer State Store - Zustand
 */

import { create } from 'zustand';
import {
  TransferInfo,
  TransferState,
  TransferDirection,
  TransportMode,
} from '../types';
import { generateId } from '../utils/id';

interface TransferStore {
  transfers: TransferInfo[];
  activeTransferCount: number;

  // Actions
  startTransfer: (transfer: Omit<TransferInfo, 'transferId' | 'startedAt' | 'progress' | 'bytesTransferred' | 'estimatedTimeRemaining' | 'speed' | 'error'>) => string;
  updateTransfer: (transferId: string, updates: Partial<TransferInfo>) => void;
  updateProgress: (transferId: string, bytesTransferred: number, speed: number) => void;
  completeTransfer: (transferId: string) => void;
  failTransfer: (transferId: string, error: string) => void;
  cancelTransfer: (transferId: string) => void;
  pauseTransfer: (transferId: string) => void;
  resumeTransfer: (transferId: string) => void;
  removeTransfer: (transferId: string) => void;
  clearCompletedTransfers: () => void;
  
  // Selectors
  getActiveDownloads: () => TransferInfo[];
  getActiveUploads: () => TransferInfo[];
  getTransferByFileId: (fileId: string) => TransferInfo | undefined;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  transfers: [],
  activeTransferCount: 0,

  startTransfer: (transfer) => {
    const transferId = generateId();
    const newTransfer: TransferInfo = {
      ...transfer,
      transferId,
      startedAt: Date.now(),
      progress: 0,
      bytesTransferred: 0,
      estimatedTimeRemaining: null,
      speed: 0,
      error: null,
      state: TransferState.PENDING,
    };

    set((state) => ({
      transfers: [...state.transfers, newTransfer],
      activeTransferCount: state.activeTransferCount + 1,
    }));

    return transferId;
  },

  updateTransfer: (transferId, updates) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId ? { ...t, ...updates } : t
      ),
    }));
  },

  updateProgress: (transferId, bytesTransferred, speed) => {
    set((state) => {
      const transfer = state.transfers.find((t) => t.transferId === transferId);
      if (!transfer) return state;

      const progress = Math.min(100, (bytesTransferred / transfer.fileSize) * 100);
      const remainingBytes = transfer.fileSize - bytesTransferred;
      const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : null;

      return {
        transfers: state.transfers.map((t) =>
          t.transferId === transferId
            ? {
                ...t,
                state: TransferState.IN_PROGRESS,
                bytesTransferred,
                progress,
                speed,
                estimatedTimeRemaining,
              }
            : t
        ),
      };
    });
  },

  completeTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId
          ? {
              ...t,
              state: TransferState.COMPLETED,
              progress: 100,
              bytesTransferred: t.fileSize,
              estimatedTimeRemaining: 0,
            }
          : t
      ),
      activeTransferCount: Math.max(0, state.activeTransferCount - 1),
    }));
  },

  failTransfer: (transferId, error) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId
          ? { ...t, state: TransferState.FAILED, error }
          : t
      ),
      activeTransferCount: Math.max(0, state.activeTransferCount - 1),
    }));
  },

  cancelTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId
          ? { ...t, state: TransferState.CANCELLED }
          : t
      ),
      activeTransferCount: Math.max(0, state.activeTransferCount - 1),
    }));
  },

  pauseTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId && t.state === TransferState.IN_PROGRESS
          ? { ...t, state: TransferState.PAUSED }
          : t
      ),
    }));
  },

  resumeTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.transferId === transferId && t.state === TransferState.PAUSED
          ? { ...t, state: TransferState.IN_PROGRESS }
          : t
      ),
    }));
  },

  removeTransfer: (transferId) => {
    set((state) => {
      const transfer = state.transfers.find((t) => t.transferId === transferId);
      const isActive =
        transfer?.state === TransferState.IN_PROGRESS ||
        transfer?.state === TransferState.PENDING;

      return {
        transfers: state.transfers.filter((t) => t.transferId !== transferId),
        activeTransferCount: isActive
          ? Math.max(0, state.activeTransferCount - 1)
          : state.activeTransferCount,
      };
    });
  },

  clearCompletedTransfers: () => {
    set((state) => ({
      transfers: state.transfers.filter(
        (t) =>
          t.state !== TransferState.COMPLETED &&
          t.state !== TransferState.FAILED &&
          t.state !== TransferState.CANCELLED
      ),
    }));
  },

  getActiveDownloads: () => {
    return get().transfers.filter(
      (t) =>
        t.direction === TransferDirection.DOWNLOAD &&
        (t.state === TransferState.IN_PROGRESS ||
          t.state === TransferState.PENDING ||
          t.state === TransferState.REQUESTING)
    );
  },

  getActiveUploads: () => {
    return get().transfers.filter(
      (t) =>
        t.direction === TransferDirection.UPLOAD &&
        (t.state === TransferState.IN_PROGRESS ||
          t.state === TransferState.PENDING)
    );
  },

  getTransferByFileId: (fileId) => {
    return get().transfers.find((t) => t.fileId === fileId);
  },
}));

