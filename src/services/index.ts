/**
 * Services barrel export
 * 
 * Note: RoomService now uses P2P adapter by default
 */

// New services
export { fileStorageService } from './FileStorageService';
export { p2pRoomServiceAdapter } from './P2PRoomServiceAdapter';

// Default room service (P2P-based)
export { p2pRoomServiceAdapter as roomService } from './P2PRoomServiceAdapter';

// Audio library
export { audioLibraryService } from './AudioLibraryService';

// Legacy services (deprecated, kept for reference)
export { bleService } from './BleService';
export { networkService } from './NetworkService';
export { roomService as legacyRoomService } from './RoomService';

