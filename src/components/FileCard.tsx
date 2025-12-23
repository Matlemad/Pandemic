/**
 * File Card Component - Displays an audio file
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SharedFileMetadata, AudioFormat } from '../types';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { formatFileSize, formatDuration } from '../utils/format';

interface FileCardProps {
  file: SharedFileMetadata;
  onPress: () => void;
  onDownload?: () => void;
  isDownloading?: boolean;
  downloadProgress?: number;
}

export function FileCard({
  file,
  onPress,
  onDownload,
  isDownloading = false,
  downloadProgress = 0,
}: FileCardProps) {
  const formatIcon = getFormatIcon(file.format);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{formatIcon}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {file.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {file.artist || 'Artista sconosciuto'}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{formatDuration(file.duration)}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{formatFileSize(file.sizeBytes)}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{file.format.toUpperCase()}</Text>
        </View>

        {!file.isSharedByMe && (
          <View style={styles.ownerBadge}>
            <Text style={styles.ownerText}>
              Da: {file.ownerName}
            </Text>
          </View>
        )}
      </View>

      {!file.isSharedByMe && onDownload && (
        <TouchableOpacity
          style={[styles.downloadButton, isDownloading && styles.downloadingButton]}
          onPress={onDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <View style={styles.progressContainer}>
              <View
                style={[styles.progressBar, { width: `${downloadProgress}%` }]}
              />
              <Text style={styles.progressText}>{Math.round(downloadProgress)}%</Text>
            </View>
          ) : (
            <Text style={styles.downloadIcon}>⬇️</Text>
          )}
        </TouchableOpacity>
      )}

      {file.isSharedByMe && (
        <View style={styles.sharingBadge}>
          <Text style={styles.sharingIcon}>📤</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function getFormatIcon(format: AudioFormat): string {
  switch (format) {
    case AudioFormat.MP3:
      return '🎵';
    case AudioFormat.WAV:
      return '🎼';
    case AudioFormat.FLAC:
      return '💎';
    case AudioFormat.M4A:
    case AudioFormat.AAC:
      return '🎶';
    case AudioFormat.OPUS:
    case AudioFormat.OGG:
      return '🎧';
    default:
      return '🎵';
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  icon: {
    fontSize: 24,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  artist: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  metaText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },

  metaDot: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginHorizontal: Spacing.xs,
  },

  ownerBadge: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primaryGlow,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },

  ownerText: {
    fontSize: Typography.sizes.xs,
    color: Colors.primary,
  },

  downloadButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },

  downloadingButton: {
    backgroundColor: Colors.surfaceHighlight,
    overflow: 'hidden',
  },

  downloadIcon: {
    fontSize: 20,
  },

  progressContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.secondaryGlow,
  },

  progressText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  sharingBadge: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  sharingIcon: {
    fontSize: 18,
  },
});

