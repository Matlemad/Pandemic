/**
 * Transfer Item Component - Shows active transfer progress
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TransferInfo, TransferState, TransferDirection } from '../types';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { formatFileSize, formatSpeed, formatTimeRemaining } from '../utils/format';

interface TransferItemProps {
  transfer: TransferInfo;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export function TransferItem({
  transfer,
  onCancel,
  onPause,
  onResume,
}: TransferItemProps) {
  const isDownload = transfer.direction === TransferDirection.DOWNLOAD;
  const accentColor = isDownload ? Colors.secondary : Colors.primary;
  const icon = isDownload ? '⬇️' : '⬆️';

  const statusText = getStatusText(transfer);
  const showProgress =
    transfer.state === TransferState.IN_PROGRESS ||
    transfer.state === TransferState.PAUSED;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>
            {transfer.fileName}
          </Text>
          <Text style={styles.peerName}>
            {isDownload ? 'Da:' : 'A:'} {transfer.peerName}
          </Text>
        </View>
        {(transfer.state === TransferState.IN_PROGRESS ||
          transfer.state === TransferState.PAUSED) && (
          <View style={styles.actions}>
            {transfer.state === TransferState.IN_PROGRESS && onPause && (
              <TouchableOpacity style={styles.actionButton} onPress={onPause}>
                <Text style={styles.actionIcon}>⏸️</Text>
              </TouchableOpacity>
            )}
            {transfer.state === TransferState.PAUSED && onResume && (
              <TouchableOpacity style={styles.actionButton} onPress={onResume}>
                <Text style={styles.actionIcon}>▶️</Text>
              </TouchableOpacity>
            )}
            {onCancel && (
              <TouchableOpacity style={styles.actionButton} onPress={onCancel}>
                <Text style={styles.actionIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {showProgress && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${transfer.progress}%`,
                  backgroundColor: accentColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              {formatFileSize(transfer.bytesTransferred)} /{' '}
              {formatFileSize(transfer.fileSize)}
            </Text>
            <Text style={styles.speedText}>
              {formatSpeed(transfer.speed)} •{' '}
              {formatTimeRemaining(transfer.estimatedTimeRemaining)}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.statusBadge, getStatusStyle(transfer.state)]}>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>
    </View>
  );
}

function getStatusText(transfer: TransferInfo): string {
  switch (transfer.state) {
    case TransferState.PENDING:
      return 'In attesa...';
    case TransferState.REQUESTING:
      return 'Richiesta...';
    case TransferState.IN_PROGRESS:
      return `${Math.round(transfer.progress)}%`;
    case TransferState.PAUSED:
      return 'In pausa';
    case TransferState.COMPLETED:
      return 'Completato ✓';
    case TransferState.FAILED:
      return `Fallito: ${transfer.error || 'Errore sconosciuto'}`;
    case TransferState.CANCELLED:
      return 'Annullato';
    default:
      return '';
  }
}

function getStatusStyle(state: TransferState) {
  switch (state) {
    case TransferState.COMPLETED:
      return { backgroundColor: Colors.success + '20' };
    case TransferState.FAILED:
      return { backgroundColor: Colors.error + '20' };
    case TransferState.CANCELLED:
      return { backgroundColor: Colors.textMuted + '20' };
    case TransferState.PAUSED:
      return { backgroundColor: Colors.warning + '20' };
    default:
      return { backgroundColor: Colors.surfaceHighlight };
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  icon: {
    fontSize: 20,
  },

  info: {
    flex: 1,
  },

  fileName: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  peerName: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },

  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },

  actionButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  actionIcon: {
    fontSize: 14,
  },

  progressSection: {
    marginTop: Spacing.md,
  },

  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },

  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },

  progressText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },

  speedText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },

  statusBadge: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },

  statusText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});

