/**
 * Room Protocol Codec — Encode/decode JSON messages
 * 
 * Handles serialization and deserialization of room protocol messages.
 */

import { RoomMessage, RoomMessageType } from './types';

// Type tag for room protocol messages
export const ROOM_MESSAGE_TAG = 'ROOM';

/**
 * Encode a room message to a string for transport
 */
export function encodeMessage(message: RoomMessage): string {
  try {
    return JSON.stringify(message);
  } catch (error) {
    console.error('[RoomCodec] Failed to encode message:', error);
    throw new Error(`Failed to encode message: ${error}`);
  }
}

/**
 * Decode a string to a room message
 */
export function decodeMessage(data: string): RoomMessage | null {
  try {
    const parsed = JSON.parse(data);
    
    // Validate that it has a type field
    if (!parsed.type || !Object.values(RoomMessageType).includes(parsed.type)) {
      console.warn('[RoomCodec] Invalid message type:', parsed.type);
      return null;
    }
    
    // Validate required fields
    if (!parsed.timestamp || !parsed.senderId) {
      console.warn('[RoomCodec] Missing required fields in message');
      return null;
    }
    
    return parsed as RoomMessage;
  } catch (error) {
    console.error('[RoomCodec] Failed to decode message:', error);
    return null;
  }
}

/**
 * Validate a room message has required fields
 */
export function validateMessage(message: RoomMessage): boolean {
  if (!message.type || !message.timestamp || !message.senderId) {
    return false;
  }
  
  // Type-specific validation
  switch (message.type) {
    case RoomMessageType.HELLO:
      return !!message.peerName;
      
    case RoomMessageType.ROOM_INFO:
      return !!message.roomId && !!message.roomName && !!message.hostPeerId;
      
    case RoomMessageType.PEER_JOINED:
      return !!message.peer && !!message.peer.peerId;
      
    case RoomMessageType.PEER_LEFT:
      return !!message.peerId;
      
    case RoomMessageType.INDEX_FULL:
    case RoomMessageType.INDEX_UPSERT:
      return Array.isArray(message.files);
      
    case RoomMessageType.INDEX_REMOVE:
      return Array.isArray(message.fileIds);
      
    case RoomMessageType.FILE_REQUEST:
      return !!message.fileId && !!message.fromPeerId;
      
    case RoomMessageType.FILE_ACCEPT:
      return !!message.fileId && !!message.toPeerId && !!message.transferMeta;
      
    case RoomMessageType.FILE_REJECT:
      return !!message.fileId && !!message.toPeerId;
      
    case RoomMessageType.PING:
    case RoomMessageType.PONG:
      return true;
      
    case RoomMessageType.ERROR:
      return !!message.code && !!message.message;
      
    default:
      return false;
  }
}

/**
 * Create a message handler map for processing different message types
 */
export type MessageHandler<T extends RoomMessage = RoomMessage> = (
  message: T
) => void | Promise<void>;

export type MessageHandlerMap = {
  [K in RoomMessageType]?: MessageHandler<Extract<RoomMessage, { type: K }>>;
};

/**
 * Process a message using a handler map
 */
export async function processMessage(
  message: RoomMessage,
  handlers: MessageHandlerMap
): Promise<boolean> {
  const handler = handlers[message.type];
  
  if (!handler) {
    console.log('[RoomCodec] No handler for message type:', message.type);
    return false;
  }
  
  try {
    await handler(message as any);
    return true;
  } catch (error) {
    console.error('[RoomCodec] Error processing message:', error);
    return false;
  }
}

