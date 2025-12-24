/**
 * P2P Events — Event emitter for P2P transport layer
 * 
 * Provides a typed event system for P2P events across platforms.
 */

import {
  P2PEventType,
  P2PEventPayloads,
  P2PEventCallback,
} from './types';

type Listener<T extends P2PEventType> = {
  callback: P2PEventCallback<T>;
  once: boolean;
};

type ListenerMap = {
  [K in P2PEventType]?: Listener<K>[];
};

/**
 * Typed event emitter for P2P events
 */
class P2PEventEmitter {
  private listeners: ListenerMap = {};

  /**
   * Subscribe to an event
   */
  on<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }

    const listener: Listener<T> = { callback, once: false };
    (this.listeners[eventType] as Listener<T>[]).push(listener);

    // Return unsubscribe function
    return () => this.off(eventType, callback);
  }

  /**
   * Subscribe to an event once
   */
  once<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): () => void {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }

    const listener: Listener<T> = { callback, once: true };
    (this.listeners[eventType] as Listener<T>[]).push(listener);

    return () => this.off(eventType, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<T extends P2PEventType>(
    eventType: T,
    callback: P2PEventCallback<T>
  ): void {
    const listeners = this.listeners[eventType] as Listener<T>[] | undefined;
    if (!listeners) return;

    this.listeners[eventType] = listeners.filter(
      (l) => l.callback !== callback
    ) as ListenerMap[T];
  }

  /**
   * Emit an event
   */
  emit<T extends P2PEventType>(
    eventType: T,
    payload: P2PEventPayloads[T]
  ): void {
    const listeners = this.listeners[eventType] as Listener<T>[] | undefined;
    if (!listeners) return;

    // Create a copy to avoid issues if listeners modify the array
    const listenersCopy = [...listeners];

    for (const listener of listenersCopy) {
      try {
        listener.callback(payload);
      } catch (error) {
        console.error(`Error in P2P event listener for ${eventType}:`, error);
      }

      // Remove once listeners
      if (listener.once) {
        this.off(eventType, listener.callback);
      }
    }
  }

  /**
   * Remove all listeners for an event type (or all events)
   */
  removeAllListeners(eventType?: P2PEventType): void {
    if (eventType) {
      delete this.listeners[eventType];
    } else {
      this.listeners = {};
    }
  }

  /**
   * Get listener count for an event type
   */
  listenerCount(eventType: P2PEventType): number {
    return this.listeners[eventType]?.length ?? 0;
  }
}

// Singleton instance
export const p2pEvents = new P2PEventEmitter();
export default p2pEvents;

