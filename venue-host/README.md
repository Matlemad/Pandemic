# 🦠 Pandemic Venue Host

Local LAN venue host for cross-platform audio sharing between Android and iOS devices.

## What It Does

- **mDNS Discovery**: Advertises itself on the local network so phones can find it
- **WebSocket Server**: Handles real-time communication with connected devices
- **Room Management**: Tracks connected peers and shared file metadata
- **File Relay**: Transfers files between devices via the host (no direct peer-to-peer required)

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)
- Same Wi-Fi network as the mobile devices

## Quick Start

```bash
# Install dependencies
cd venue-host
pnpm install

# Start development server
pnpm dev

# Or build and run production
pnpm build
pnpm start
```

## Configuration

Set environment variables or create a `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8787 | WebSocket server port |
| `ROOM_NAME` | Pandemic Venue | Room display name |
| `SERVICE_NAME` | Pandemic Venue Host | mDNS service name |
| `MAX_FILE_MB` | 50 | Maximum file size for relay |

## Protocol

### mDNS Service

- Type: `_audiowallet._tcp`
- TXT Records: `v=1`, `room=<ROOM_NAME>`, `relay=1`

### WebSocket Messages

**Client → Host:**
- `HELLO` - Register with peerId, deviceName, platform
- `JOIN_ROOM` - Join the venue room
- `LEAVE_ROOM` - Leave the room
- `HEARTBEAT` - Keep connection alive
- `SHARE_FILES` - Publish file metadata
- `UNSHARE_FILES` - Remove file metadata
- `REQUEST_FILE` - Request to download a file
- `RELAY_PULL` - Start downloading via relay
- `RELAY_PUSH_META` - Owner sending file metadata for relay
- `RELAY_COMPLETE` - Owner finished uploading for relay

**Host → Client:**
- `WELCOME` - Host info and capabilities
- `ROOM_INFO` - Room details
- `PEER_JOINED` / `PEER_LEFT` - Peer presence updates
- `INDEX_FULL` - Complete file index
- `INDEX_UPSERT` / `INDEX_REMOVE` - Incremental index updates
- `FILE_OFFER` - Response to file request
- `TRANSFER_START` / `TRANSFER_PROGRESS` / `TRANSFER_COMPLETE` - Transfer status

### Binary Frames (Relay)

File chunks are sent as binary WebSocket frames:
- Header: `[transferIdLen (4 bytes)][transferId (string)][chunk data]`
- Chunks are forwarded from owner to requester via the host

## Web Dashboard

Open **http://localhost:8787** in your browser for a real-time dashboard:

| Feature | Description |
|---------|-------------|
| 📊 Stats | Peer count, file count, active transfers |
| 👥 Connected Peers | Device names, platforms, file counts |
| 🎵 Shared Files | All files shared in the room with metadata |
| 🏠 Room Setup | Create/update room name, toggle lock |
| 🗑️ Close Room | Close the room and disconnect all peers |
| 📤 Host Library | Upload audio files to share as host |
| 🔄 Auto-refresh | Updates every 2 seconds |

**Room Management:**
- **Create Room**: Set a room name to start accepting connections
- **Room Lock**: When locked, only the host can upload files (via dashboard)
- **Close Room**: Stops mDNS advertisement and disconnects all peers

**Host Library:**
- Upload audio files directly from the dashboard
- Files are automatically shared to all connected peers
- Files persist across host restarts (saved to disk)

Additional endpoints:
- `GET /health` - JSON status for monitoring
- `POST /admin/room` - Create/update room
- `POST /admin/room/lock` - Toggle room lock
- `DELETE /admin/room` - Close room

## Testing

1. Start the venue host on a laptop connected to Wi-Fi
2. Open http://localhost:8787 to verify and monitor
3. On Android device: Open Pandemic, look for "Venue Rooms" section
4. On iOS device: Same, look for venue room discovery
5. Both devices should see the same room and can share files
6. Monitor the dashboard to see peers join and files shared

## Troubleshooting

**Room not appearing on phones:**
- Ensure all devices are on the same Wi-Fi network
- Check firewall isn't blocking port 8787
- Some routers have "AP isolation" - try a different network
- Make sure a room is created in the dashboard first

**File transfers failing:**
- Check MAX_FILE_MB limit
- Ensure stable Wi-Fi connection
- Look at host console logs for errors
- Verify file owner is still connected

**mDNS not working:**
- On Linux, ensure avahi-daemon is running
- On Windows, ensure Bonjour service is installed
- Older Android versions (11 and below) may have issues with mDNS
- Use manual connection in app: "Connetti manualmente a Venue Host"
- Find host IP with `ifconfig` (macOS/Linux) or `ipconfig` (Windows)

**Files not visible when joining:**
- Files are synchronized when you join a room
- If files don't appear, try refreshing the app
- Host files are always included in the index
- Peer files are synchronized when they join or share

**Files disappear when leaving/returning:**
- This is expected behavior - files are session-based
- Host files persist across sessions
- Peer files are removed when they disconnect
- Re-join the room to see current files

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Android App    │     │    iOS App      │
│  (VenueLan      │     │  (VenueLan      │
│   Transport)    │     │   Transport)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    WebSocket          │
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │                       │
         │   Venue Host          │
         │   (Node.js)           │
         │                       │
         │  • mDNS Advertisement │
         │  • WebSocket Server   │
         │  • Room Manager       │
         │  • File Relay         │
         │                       │
         └───────────────────────┘
```

