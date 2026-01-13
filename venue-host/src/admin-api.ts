/**
 * Admin API — Local-only HTTP API for venue host management
 * 
 * Bound to 127.0.0.1 only for security.
 * Requires X-ADMIN-TOKEN header for authentication.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { hostState, HostState } from './host-state.js';

// ============================================================================
// TYPES
// ============================================================================

interface AdminRoute {
  method: string;
  path: string | RegExp;
  handler: (req: IncomingMessage, res: ServerResponse, params?: Record<string, string>) => Promise<void>;
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status: number = 400): void {
  sendJson(res, { error: message }, status);
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function parseMultipartBody(req: IncomingMessage): Promise<{ files: Array<{ name: string; data: Buffer }> }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      
      if (!boundaryMatch) {
        reject(new Error('No boundary in multipart'));
        return;
      }
      
      const boundary = boundaryMatch[1];
      const files = parseMultipartBuffer(buffer, boundary);
      resolve({ files });
    });
    req.on('error', reject);
  });
}

function parseMultipartBuffer(buffer: Buffer, boundary: string): Array<{ name: string; data: Buffer }> {
  const files: Array<{ name: string; data: Buffer }> = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  
  let start = 0;
  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    
    // Find headers end
    const headersEndIndex = buffer.indexOf('\r\n\r\n', boundaryIndex);
    if (headersEndIndex === -1) break;
    
    // Parse headers
    const headers = buffer.slice(boundaryIndex + boundaryBuffer.length, headersEndIndex).toString();
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    
    if (filenameMatch) {
      const filename = filenameMatch[1];
      
      // Find next boundary
      const dataStart = headersEndIndex + 4;
      let nextBoundary = buffer.indexOf(boundaryBuffer, dataStart);
      if (nextBoundary === -1) nextBoundary = buffer.indexOf(endBoundaryBuffer, dataStart);
      if (nextBoundary === -1) break;
      
      // Extract file data (minus trailing \r\n)
      const fileData = buffer.slice(dataStart, nextBoundary - 2);
      files.push({ name: filename, data: fileData });
    }
    
    start = headersEndIndex + 4;
  }
  
  return files;
}

// ============================================================================
// ROUTES
// ============================================================================

const routes: AdminRoute[] = [
  // Bootstrap - get admin token (for dev/dashboard)
  {
    method: 'GET',
    path: '/admin/bootstrap',
    handler: async (_req, res) => {
      sendJson(res, { token: hostState.getAdminToken() });
    },
  },

  // Get full state
  {
    method: 'GET',
    path: '/admin/state',
    handler: async (_req, res) => {
      const state = hostState.getState();
      sendJson(res, {
        room: state.room,
        hostFiles: state.hostFiles.map(f => ({
          id: f.id,
          title: f.title,
          artist: f.artist,
          fileName: f.fileName,
          size: f.size,
          mimeType: f.mimeType,
          sha256: f.sha256,
          createdAt: f.createdAt,
          published: f.published,
        })),
      });
    },
  },

  // Create/update room
  {
    method: 'POST',
    path: '/admin/room',
    handler: async (req, res) => {
      const body = await parseJsonBody(req) as { name?: string; locked?: boolean };
      
      if (!body.name || typeof body.name !== 'string') {
        sendError(res, 'Room name is required');
        return;
      }
      
      const room = hostState.createOrUpdateRoom(body.name.trim(), body.locked);
      sendJson(res, { room });
    },
  },

  // Toggle room lock
  {
    method: 'POST',
    path: '/admin/room/lock',
    handler: async (req, res) => {
      const body = await parseJsonBody(req) as { locked?: boolean };
      
      if (typeof body.locked !== 'boolean') {
        sendError(res, 'locked must be a boolean');
        return;
      }
      
      const room = hostState.setRoomLock(body.locked);
      if (!room) {
        sendError(res, 'No room exists yet');
        return;
      }
      
      sendJson(res, { room });
    },
  },

  // Close room
  {
    method: 'DELETE',
    path: '/admin/room',
    handler: async (_req, res) => {
      const success = hostState.closeRoom();
      if (!success) {
        sendError(res, 'No room to close');
        return;
      }
      
      sendJson(res, { success: true, message: 'Room closed' });
    },
  },

  // Upload files
  {
    method: 'POST',
    path: '/admin/files',
    handler: async (req, res) => {
      const contentType = req.headers['content-type'] || '';
      
      if (contentType.includes('multipart/form-data')) {
        const { files } = await parseMultipartBody(req);
        
        if (files.length === 0) {
          sendError(res, 'No files uploaded');
          return;
        }
        
        const added = [];
        for (const file of files) {
          try {
            const hostFile = await hostState.addFileFromBuffer(file.data, file.name);
            added.push(hostFile);
          } catch (err: any) {
            console.error('[AdminAPI] Failed to add file:', err);
          }
        }
        
        sendJson(res, { files: added });
      } else {
        sendError(res, 'Expected multipart/form-data');
      }
    },
  },

  // Remove file
  {
    method: 'DELETE',
    path: /^\/admin\/files\/([a-zA-Z0-9_-]+)$/,
    handler: async (_req, res, params) => {
      const fileId = params?.id;
      if (!fileId) {
        sendError(res, 'File ID required');
        return;
      }
      
      const success = hostState.removeFile(fileId);
      if (!success) {
        sendError(res, 'File not found', 404);
        return;
      }
      
      sendJson(res, { success: true });
    },
  },
];

// ============================================================================
// HANDLER
// ============================================================================

export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS' && url.startsWith('/admin')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    res.end();
    return true;
  }

  // Check if this is an admin route
  if (!url.startsWith('/admin')) {
    return false;
  }

  // Bootstrap endpoint doesn't require auth
  if (url === '/admin/bootstrap' && method === 'GET') {
    for (const route of routes) {
      if (route.path === url && route.method === method) {
        await route.handler(req, res);
        return true;
      }
    }
  }

  // Validate admin token
  const token = req.headers['x-admin-token'];
  if (token !== hostState.getAdminToken()) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  // Find matching route
  for (const route of routes) {
    if (route.method !== method) continue;

    if (typeof route.path === 'string') {
      if (route.path === url) {
        try {
          await route.handler(req, res);
        } catch (err: any) {
          console.error('[AdminAPI] Route handler error:', err);
          sendError(res, err.message || 'Internal server error', 500);
        }
        return true;
      }
    } else {
      const match = url.match(route.path);
      if (match) {
        const params = { id: match[1] };
        try {
          await route.handler(req, res, params);
        } catch (err: any) {
          console.error('[AdminAPI] Route handler error:', err);
          sendError(res, err.message || 'Internal server error', 500);
        }
        return true;
      }
    }
  }

  sendError(res, 'Not found', 404);
  return true;
}

export default handleAdminRequest;

