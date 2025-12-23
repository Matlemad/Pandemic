/**
 * ID Generation Utilities
 */

import * as Crypto from 'expo-crypto';

/**
 * Generate a random UUID v4
 */
export function generateId(): string {
  return Crypto.randomUUID();
}

/**
 * Generate a short ID (8 characters)
 */
export function generateShortId(): string {
  return Crypto.randomUUID().slice(0, 8);
}

/**
 * Generate a session token (32 characters)
 */
export function generateSessionToken(): string {
  return Crypto.randomUUID().replace(/-/g, '') + generateShortId();
}

/**
 * Generate a room-friendly display code (e.g., "ABCD-1234")
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}

