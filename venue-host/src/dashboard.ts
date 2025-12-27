/**
 * Dashboard HTML — Control plane for venue host
 */

export function getDashboardHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Pandemic Venue Host - Control Panel</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      padding: 24px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    
    /* Header */
    .header { 
      display: flex; 
      align-items: center; 
      gap: 16px; 
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 { font-size: 26px; color: #ff2d55; font-weight: 700; }
    .status-badge {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-online { background: rgba(0,255,136,0.2); color: #00ff88; }
    .status-offline { background: rgba(255,100,100,0.2); color: #ff6464; }
    
    /* Stats Grid */
    .stats-grid { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      gap: 16px; 
      margin-bottom: 24px; 
    }
    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-card { 
      background: rgba(255,255,255,0.05); 
      padding: 20px; 
      border-radius: 16px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .stat-value { font-size: 32px; font-weight: bold; color: #ff2d55; }
    .stat-label { font-size: 13px; color: #888; margin-top: 6px; }
    
    /* Sections */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 900px) {
      .grid-2 { grid-template-columns: 1fr; }
    }
    
    .section { 
      background: rgba(255,255,255,0.03); 
      border-radius: 16px; 
      padding: 20px; 
      margin-bottom: 20px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .section h2 { 
      font-size: 16px; 
      margin-bottom: 16px; 
      color: #fff; 
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    /* Forms */
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; color: #888; margin-bottom: 6px; }
    .form-input {
      width: 100%;
      padding: 12px 14px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
    }
    .form-input:focus { outline: none; border-color: #ff2d55; }
    
    /* Toggle */
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .toggle-label { font-size: 14px; }
    .toggle-desc { font-size: 12px; color: #666; margin-top: 4px; }
    .toggle {
      width: 50px;
      height: 28px;
      background: #333;
      border-radius: 14px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle.on { background: #ff2d55; }
    .toggle::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      background: #fff;
      border-radius: 50%;
      top: 3px;
      left: 3px;
      transition: left 0.2s;
    }
    .toggle.on::after { left: 25px; }
    
    /* Buttons */
    .btn {
      padding: 12px 20px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { 
      background: #ff2d55; 
      color: #fff; 
    }
    .btn-primary:hover { background: #e0254a; }
    .btn-primary:disabled { background: #444; cursor: not-allowed; }
    .btn-secondary {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .btn-danger {
      background: #dc3545;
      color: #fff;
    }
    .btn-danger:hover { background: #c82333; }
    .btn-danger {
      background: rgba(255,100,100,0.2);
      color: #ff6464;
    }
    .btn-danger:hover { background: rgba(255,100,100,0.3); }
    
    /* File Upload */
    .upload-zone {
      border: 2px dashed rgba(255,255,255,0.2);
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-zone:hover { border-color: #ff2d55; background: rgba(255,45,85,0.05); }
    .upload-zone.dragover { border-color: #ff2d55; background: rgba(255,45,85,0.1); }
    .upload-icon { font-size: 40px; margin-bottom: 10px; }
    .upload-text { font-size: 14px; color: #888; }
    .upload-input { display: none; }
    
    /* File List */
    .file-list { max-height: 300px; overflow-y: auto; }
    .file-item { 
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .file-info { flex: 1; min-width: 0; }
    .file-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-meta { font-size: 12px; color: #666; margin-top: 2px; }
    .file-badge { 
      background: rgba(0,255,136,0.2); 
      color: #00ff88; 
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 10px;
    }
    .file-remove {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 6px;
      font-size: 18px;
    }
    .file-remove:hover { color: #ff6464; }
    
    /* Peer List */
    .peer-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .peer-name { font-weight: 500; }
    .peer-meta { font-size: 12px; color: #666; margin-top: 2px; }
    .peer-online { color: #00ff88; font-size: 20px; }
    
    /* Empty State */
    .empty { 
      text-align: center; 
      color: #555; 
      padding: 30px;
      font-size: 14px;
    }
    
    /* Progress */
    .progress-bar {
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      margin-top: 8px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #ff2d55;
      transition: width 0.3s;
    }
    
    /* Logs */
    .log-container { 
      background: #0a0a12; 
      padding: 14px; 
      border-radius: 10px; 
      font-family: 'SF Mono', monospace; 
      font-size: 12px;
      max-height: 180px;
      overflow-y: auto;
    }
    .log-entry { margin-bottom: 4px; opacity: 0.8; }
    .log-time { color: #555; }
    .log-success { color: #00ff88; }
    .log-error { color: #ff6464; }
    .log-info { color: #5ac8fa; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🦠 Pandemic Venue Host</h1>
      <span id="serverStatus" class="status-badge status-online">● Server Running</span>
      <span id="mdnsStatus" class="status-badge status-offline">○ mDNS Off</span>
    </div>
    
    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="peerCount">0</div>
        <div class="stat-label">Connected Peers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="hostFileCount">0</div>
        <div class="stat-label">Host Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="guestFileCount">0</div>
        <div class="stat-label">Guest Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="transferCount">0</div>
        <div class="stat-label">Active Transfers</div>
      </div>
    </div>
    
    <div class="grid-2">
      <!-- Room Setup -->
      <div class="section">
        <h2>🏠 Room Setup</h2>
        
        <div class="form-group">
          <label class="form-label">Room Name</label>
          <input type="text" id="roomName" class="form-input" placeholder="e.g. Party Mix 2024" />
        </div>
        
        <div class="toggle-row">
          <div>
            <div class="toggle-label">🔒 Room Lock</div>
            <div class="toggle-desc">Only host can upload files when locked</div>
          </div>
          <div id="lockToggle" class="toggle" onclick="toggleLock()"></div>
        </div>
        
        <div style="margin-top: 20px; display: flex; gap: 10px;">
          <button id="saveRoomBtn" class="btn btn-primary" onclick="saveRoom()">Create Room</button>
          <button id="closeRoomBtn" class="btn btn-danger" onclick="closeRoom()" style="display: none;">Close Room</button>
        </div>
        
        <div id="roomStatus" style="margin-top: 16px; font-size: 13px; color: #666;"></div>
      </div>
      
      <!-- Host Library -->
      <div class="section">
        <h2>🎵 Host Library</h2>
        
        <div id="uploadZone" class="upload-zone" onclick="document.getElementById('fileInput').click()">
          <div class="upload-icon">📂</div>
          <div class="upload-text">Click or drag audio files here</div>
          <div id="uploadProgress" style="display: none;">
            <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
          </div>
        </div>
        <input type="file" id="fileInput" class="upload-input" multiple accept="audio/*" onchange="handleFiles(this.files)" />
        
        <div id="hostFileList" class="file-list" style="margin-top: 16px;">
          <div class="empty">No files yet. Upload some tracks!</div>
        </div>
      </div>
    </div>
    
    <div class="grid-2">
      <!-- Connected Peers -->
      <div class="section">
        <h2>📱 Connected Peers</h2>
        <div id="peerList">
          <div class="empty">No peers connected</div>
        </div>
      </div>
      
      <!-- Activity Log -->
      <div class="section">
        <h2>📋 Activity Log</h2>
        <div id="logContainer" class="log-container">
          <div class="log-entry"><span class="log-time">[--:--:--]</span> <span class="log-info">Dashboard opened</span></div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let adminToken = null;
    let currentState = { room: null, hostFiles: [] };
    let isLocked = false;
    
    // Format helpers
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
      return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }
    
    function formatTime(ts) {
      return new Date(ts).toLocaleTimeString();
    }
    
    function log(message, type = 'info') {
      const container = document.getElementById('logContainer');
      const time = new Date().toLocaleTimeString();
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = '<span class="log-time">[' + time + ']</span> <span class="log-' + type + '">' + message + '</span>';
      container.insertBefore(entry, container.firstChild);
      if (container.children.length > 50) container.removeChild(container.lastChild);
    }
    
    // Bootstrap - get admin token
    async function bootstrap() {
      try {
        const res = await fetch('/admin/bootstrap');
        const data = await res.json();
        adminToken = data.token;
        log('Connected to admin API', 'success');
        await refreshState();
      } catch (e) {
        log('Failed to connect: ' + e.message, 'error');
      }
    }
    
    // API helpers
    async function api(method, path, body = null) {
      const options = {
        method,
        headers: {
          'X-Admin-Token': adminToken,
          'Content-Type': 'application/json',
        },
      };
      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }
      const res = await fetch(path, options);
      return res.json();
    }
    
    // Refresh state
    async function refreshState() {
      try {
        const state = await api('GET', '/admin/state');
        currentState = state;
        updateUI();
      } catch (e) {
        console.error('Refresh error:', e);
      }
    }
    
    // Update UI
    function updateUI() {
      // Room
      if (currentState.room) {
        document.getElementById('roomName').value = currentState.room.name;
        isLocked = currentState.room.locked;
        document.getElementById('lockToggle').className = 'toggle' + (isLocked ? ' on' : '');
        document.getElementById('saveRoomBtn').textContent = 'Update Room';
        document.getElementById('closeRoomBtn').style.display = 'inline-block';
        document.getElementById('roomStatus').innerHTML = '✅ Room active: <strong>' + currentState.room.name + '</strong>' + (isLocked ? ' (Locked)' : '');
        document.getElementById('mdnsStatus').className = 'status-badge status-online';
        document.getElementById('mdnsStatus').textContent = '● mDNS Active';
      } else {
        document.getElementById('roomName').value = '';
        document.getElementById('saveRoomBtn').textContent = 'Create Room';
        document.getElementById('closeRoomBtn').style.display = 'none';
        document.getElementById('roomStatus').innerHTML = '⚠️ No room created yet';
        document.getElementById('mdnsStatus').className = 'status-badge status-offline';
        document.getElementById('mdnsStatus').textContent = '○ mDNS Off';
      }
      
      // Host files
      const fileList = document.getElementById('hostFileList');
      document.getElementById('hostFileCount').textContent = currentState.hostFiles?.length || 0;
      
      if (currentState.hostFiles && currentState.hostFiles.length > 0) {
        fileList.innerHTML = currentState.hostFiles.map(f => \`
          <div class="file-item">
            <div class="file-info">
              <div class="file-title">\${f.title}</div>
              <div class="file-meta">\${formatSize(f.size)} • \${f.mimeType}</div>
            </div>
            <span class="file-badge">Published</span>
            <button class="file-remove" onclick="removeFile('\${f.id}')" title="Remove">🗑</button>
          </div>
        \`).join('');
      } else {
        fileList.innerHTML = '<div class="empty">No files yet. Upload some tracks!</div>';
      }
    }
    
    // Room actions
    async function saveRoom() {
      const name = document.getElementById('roomName').value.trim();
      if (!name) {
        log('Room name is required', 'error');
        return;
      }
      
      try {
        const result = await api('POST', '/admin/room', { name, locked: isLocked });
        log('Room saved: ' + name, 'success');
        await refreshState();
      } catch (e) {
        log('Failed to save room: ' + e.message, 'error');
      }
    }
    
    async function toggleLock() {
      isLocked = !isLocked;
      document.getElementById('lockToggle').className = 'toggle' + (isLocked ? ' on' : '');
      
      if (currentState.room) {
        try {
          await api('POST', '/admin/room/lock', { locked: isLocked });
          log('Room lock ' + (isLocked ? 'enabled' : 'disabled'), 'info');
          await refreshState();
        } catch (e) {
          log('Failed to update lock: ' + e.message, 'error');
        }
      }
    }
    
    async function closeRoom() {
      if (!confirm('Are you sure you want to close this room? All connected peers will be disconnected.')) {
        return;
      }
      
      try {
        await api('DELETE', '/admin/room');
        log('Room closed', 'info');
        await refreshState();
      } catch (e) {
        log('Failed to close room: ' + e.message, 'error');
      }
    }
    
    // File upload
    function handleFiles(files) {
      if (!files || files.length === 0) return;
      if (!adminToken) {
        log('Not authenticated', 'error');
        return;
      }
      
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      
      document.getElementById('uploadProgress').style.display = 'block';
      document.getElementById('progressFill').style.width = '0%';
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/admin/files');
      xhr.setRequestHeader('X-Admin-Token', adminToken);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          document.getElementById('progressFill').style.width = pct + '%';
        }
      };
      
      xhr.onload = async () => {
        document.getElementById('uploadProgress').style.display = 'none';
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          log('Uploaded ' + (result.files?.length || 0) + ' file(s)', 'success');
          await refreshState();
        } else {
          log('Upload failed: ' + xhr.statusText, 'error');
        }
      };
      
      xhr.onerror = () => {
        document.getElementById('uploadProgress').style.display = 'none';
        log('Upload error', 'error');
      };
      
      xhr.send(formData);
    }
    
    async function removeFile(fileId) {
      if (!confirm('Remove this file?')) return;
      
      try {
        await api('DELETE', '/admin/files/' + fileId);
        log('File removed', 'info');
        await refreshState();
      } catch (e) {
        log('Failed to remove file: ' + e.message, 'error');
      }
    }
    
    // Drag and drop
    const uploadZone = document.getElementById('uploadZone');
    uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); };
    uploadZone.ondragleave = () => { uploadZone.classList.remove('dragover'); };
    uploadZone.ondrop = (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    };
    
    // Poll for peer/stats updates
    async function refreshStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        document.getElementById('peerCount').textContent = data.peerCount || 0;
        document.getElementById('guestFileCount').textContent = data.defaultRoom?.fileCount || 0;
        document.getElementById('transferCount').textContent = data.activeTransfers || 0;
        
        const peerList = document.getElementById('peerList');
        if (data.peers && data.peers.length > 0) {
          peerList.innerHTML = data.peers.map(p => \`
            <div class="peer-item">
              <div>
                <div class="peer-name">\${p.deviceName}</div>
                <div class="peer-meta">\${p.platform} • \${p.fileCount} files</div>
              </div>
              <span class="peer-online">●</span>
            </div>
          \`).join('');
        } else {
          peerList.innerHTML = '<div class="empty">No peers connected</div>';
        }
      } catch (e) {
        console.error('Stats refresh error:', e);
      }
    }
    
    // Initialize
    bootstrap();
    setInterval(refreshStats, 2000);
    setInterval(refreshState, 5000);
  </script>
</body>
</html>`;
}

