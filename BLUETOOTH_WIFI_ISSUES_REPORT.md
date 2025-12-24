# 📋 Report Problemi: Bluetooth Signaling e WiFi Locale
## App Android Pandemic - Scambio File Audio Local-Only

**Data Analisi**: 2024  
**Versione Codebase**: Analizzata  
**Piattaforma Target**: Android (local-only, no Internet)

---

## 📑 Indice

1. [Problemi Bluetooth (BLE) come Signaling](#1-problemi-bluetooth-ble-come-signaling)
2. [Problemi Rete WiFi Locale (Senza Internet)](#2-problemi-rete-wifi-locale-senza-internet)
3. [Problemi di Integrazione BLE + WiFi](#3-problemi-di-integrazione-ble--wifi)
4. [Raccomandazioni e Soluzioni](#4-raccomandazioni-e-soluzioni)
5. [Priorità di Intervento](#5-priorità-di-intervento)

---

## 1. Problemi Bluetooth (BLE) come Signaling

### 1.1 ❌ BLE Advertising Limitato a Android

**Problema**: Il modulo nativo BLE advertising è implementato solo per Android. Su iOS non è disponibile.

**Evidenza**:
```12:27:src/services/native/BleAdvertisingNative.ts
const { BleAdvertisingModule } = NativeModules;

// Check if module is available
const isAvailable = Platform.OS === 'android' && BleAdvertisingModule != null;
```

**Impatto**:
- Su iOS, l'app non può fare advertising BLE reale
- Le stanze create su iOS non vengono scoperte da altri dispositivi
- L'app funziona solo come guest su iOS, non come host

**Soluzione Necessaria**:
- Implementare modulo nativo iOS usando `CBPeripheralManager`
- Creare bridge Objective-C/Swift per React Native
- Gestire permessi iOS specifici (`NSBluetoothAlwaysUsageDescription`)

---

### 1.2 ⚠️ Limitazione Dati BLE Advertisement (31 bytes)

**Problema**: I dati BLE advertisement sono limitati a 31 bytes totali. Questo limita drasticamente le informazioni che possono essere trasmesse.

**Evidenza**:
```415:441:src/services/BleService.ts
if (pandemicServiceData) {
  // Decode service data: [15 bytes roomId prefix][1 byte wifi flag] = 16 bytes
  const bytes = base64ToBytes(pandemicServiceData);
  
  console.log(`📡 Decoding service data: ${pandemicServiceData}, bytes length: ${bytes.length}`);
  
  if (bytes.length >= 16) {
    // Extract roomId prefix (first 15 bytes as ASCII)
    const roomIdPrefix = bytesToAscii(bytes, 0, 15);
    const wifiFlag = bytes[15] === 1;
    
    console.log(`✅ Found Pandemic room via service data: prefix=${roomIdPrefix}, wifi=${wifiFlag}, bytes:`, Array.from(bytes).map(b => b.toString(16)).join(' '));
    
    // Use prefix as roomId identifier (we'll need to match with full roomId when joining)
    // Format the prefix as a UUID-like string for compatibility
    // Prefix is 15 chars, UUID without dash is 32 chars, so we pad with zeros
    const roomIdFromPrefix = `${roomIdPrefix}0-0000-0000-0000-000000000000`.substring(0, 36);
    
    return {
      roomId: roomIdFromPrefix, // This is a reconstructed ID, will be verified on join
      roomName: `Room ${roomIdPrefix.substring(0, 4)}`, // Placeholder name
      hostId: 'unknown',
      hostName: 'Unknown Host',
      hostAddress: null,
      wifiAvailable: wifiFlag,
      createdAt: Date.now(),
    };
```

**Impatto**:
- Solo 15 caratteri per il roomId (deve essere troncato)
- Nome stanza non può essere trasmesso (solo placeholder generico)
- hostId, hostName, hostAddress non possono essere trasmessi nell'advertisement
- Informazioni critiche devono essere recuperate durante l'handshake GATT

**Problemi Derivati**:
- Gli utenti vedono nomi generici come "Room a1b2" invece del nome reale
- L'handshake GATT diventa obbligatorio anche solo per vedere il nome completo
- Maggiore latenza nella discovery

---

### 1.3 ⚠️ Parsing BLE Advertisement Fragile

**Problema**: Il parsing dei dati BLE advertisement ha multiple fallback e logica complessa che può fallire silenziosamente.

**Evidenza**:
```383:494:src/services/BleService.ts
private parseAdvertisement(device: any): Omit<DiscoveredRoom, 'rssi' | 'lastSeen' | 'peerCount'> | null {
  // Check if device has our service UUID (native module format)
  const serviceUUIDs = device.serviceUUIDs || device.serviceUuids || [];
  const pandemicServiceUUIDLower = PANDEMIC_SERVICE_UUID.toLowerCase();
  const hasPandemicService = serviceUUIDs.some((uuid: string) => {
    const match = uuid.toLowerCase() === pandemicServiceUUIDLower;
    if (match) {
      console.log(`✅ Service UUID match: ${uuid} === ${PANDEMIC_SERVICE_UUID}`);
    }
    return match;
  });

  console.log(`🔍 Checking device: serviceUUIDs=${JSON.stringify(serviceUUIDs)}, hasPandemicService=${hasPandemicService}, serviceData keys=${Object.keys(device.serviceData || {}).join(', ')}`);

  if (hasPandemicService) {
    // Native module format: data is in service data
    try {
      // react-native-ble-plx exposes service data in device.serviceData
      // Format: { [serviceUUID]: base64 encoded bytes }
      // Note: The key might be in different case, so we need to find it case-insensitively
      const serviceData = device.serviceData || {};
      
      // Find the service data key (case-insensitive match)
      let pandemicServiceData: string | undefined;
      const serviceDataKeys = Object.keys(serviceData);
      for (const key of serviceDataKeys) {
        if (key.toLowerCase() === pandemicServiceUUIDLower) {
          pandemicServiceData = serviceData[key];
          break;
        }
      }
```

**Problemi**:
- Matching case-insensitive può fallire se il formato cambia
- Fallback a formato legacy (device name) non sempre funziona
- Nessuna validazione robusta dei dati parsati
- Errori silenziosi (try-catch che nasconde problemi)

**Impatto**:
- Stanze valide potrebbero non essere scoperte
- Dati corrotti possono causare crash o comportamenti strani
- Difficile debuggare quando il parsing fallisce

---

### 1.4 ❌ Handshake BLE GATT Non Completamente Implementato

**Problema**: L'handshake BLE GATT per il join è solo parzialmente implementato. Non c'è scambio reale di dati via GATT characteristics.

**Evidenza**:
```586:657:src/services/BleService.ts
async joinRoom(
  room: DiscoveredRoom,
  peerId: PeerId,
  peerName: string
): Promise<BleJoinResponse> {
  if (!this.isBleAvailable || !this.manager) {
    // Simulation mode - return success with mock data
    console.warn('BLE not available - simulating join');
    return {
      success: true,
      sessionToken: generateSessionToken(),
      hostAddress: room.hostAddress || '192.168.1.1:8080',
      error: null,
    };
  }

  const device = Array.from(this.discoveredDevices.values())
    .find(d => {
      const data = this.parseAdvertisement(d.device);
      return data?.roomId === room.roomId;
    })?.device;

  if (!device) {
    return {
      success: false,
      sessionToken: null,
      hostAddress: null,
      error: 'Dispositivo non trovato',
    };
  }

  try {
    // Connect to the device
    const connectedDevice = await this.manager.connectToDevice(device.id, {
      timeout: 10000,
    });

    // Discover services and characteristics
    await connectedDevice.discoverAllServicesAndCharacteristics();

    // Read room info to verify
    // In a real implementation, we would write our join request
    // and read the response from the GATT characteristics

    // For now, simulate a successful join
    // In a real implementation, we would call the host's onJoinRequest callback
    // and get the roomName from the response. For now, use the room name from discovery
    // (which may be a generic "Room {prefix}" if parsed from BLE advertisement only)
    const response: BleJoinResponse = {
      success: true,
      sessionToken: generateSessionToken(),
      hostAddress: room.hostAddress,
      roomName: room.roomName, // Use room name from discovery (will be updated via LAN if available)
      error: null,
    };

    // Disconnect BLE after handshake
    await connectedDevice.cancelConnection();

    return response;
```

**Problemi**:
- Non scrive realmente dati nelle GATT characteristics
- Non legge risposta dal host via GATT
- Genera sessionToken lato guest invece di riceverlo dal host
- Non verifica realmente l'identità del host
- Commenti indicano "In a real implementation" ma non è implementato

**Impatto**:
- Nessuna autenticazione reale durante l'handshake
- SessionToken generato lato guest non è valido lato host
- Possibili problemi di sicurezza (qualsiasi dispositivo può generare un token)
- Il nome completo della stanza non viene recuperato via BLE

---

### 1.5 ⚠️ Gestione Permessi Android Complessa

**Problema**: La gestione dei permessi BLE su Android varia tra versioni (Android 12+ vs <12) e può fallire silenziosamente.

**Evidenza**:
```184:254:src/services/BleService.ts
private async requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    // Android 12 (API 31) introduced new BLE permissions
    // For older versions, we only need LOCATION permission (BLUETOOTH/BLUETOOTH_ADMIN are granted at install time)
    const androidVersion = Platform.Version as number;
    const isAndroid12OrHigher = androidVersion >= 31;

    let permissions: any[] = [];

    if (isAndroid12OrHigher) {
      // Android 12+ - New granular permissions
      permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
    } else {
      // Android < 12 - Only need location permission
      // BLUETOOTH and BLUETOOTH_ADMIN are granted at install time via manifest
      permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
    }

    // Filter out undefined permissions (in case some constants are not available)
    const validPermissions = permissions.filter((p) => p !== undefined);

    if (validPermissions.length === 0) {
      console.warn('No valid BLE permissions found for Android version:', androidVersion);
      // On Android < 12, if no permissions are needed, consider it granted
      return !isAndroid12OrHigher;
    }

    const results = await PermissionsAndroid.requestMultiple(validPermissions);
    
    // Check if all permissions were granted
    const allGranted = Object.values(results).every(
      (result) => result === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      console.warn('Some BLE permissions were denied:', results);
    }

    return allGranted;
```

**Problemi**:
- Fallback complesso che può mascherare problemi
- Se alcuni permessi sono undefined, vengono filtrati silenziosamente
- Non distingue tra permessi critici e opzionali
- Messaggi di errore generici per l'utente

**Impatto**:
- L'app può fallire in modo silenzioso se permessi mancanti
- Difficile per l'utente capire quali permessi servono
- Problemi su dispositivi con versioni Android customizzate

---

### 1.6 ⚠️ Cleanup Dispositivi Stale Non Affidabile

**Problema**: Il cleanup dei dispositivi non più visibili si basa su timestamp e può rimuovere dispositivi ancora attivi.

**Evidenza**:
```496:514:src/services/BleService.ts
private cleanupStaleDevices(): void {
  const now = Date.now();
  const staleThreshold = 15000; // 15 seconds

  for (const [deviceId, data] of this.discoveredDevices) {
    if (now - data.lastSeen > staleThreshold) {
      this.discoveredDevices.delete(deviceId);
      
      // Try to extract room ID and notify
      const roomData = this.parseAdvertisement(data.device);
      if (roomData) {
        this.callbacks?.onRoomLost(roomData.roomId);
      }
    }
  }
}
```

**Problemi**:
- Threshold fisso di 15 secondi può essere troppo corto
- BLE può avere interruzioni temporanee senza che il dispositivo sia realmente perso
- Nessun meccanismo di retry o riconnessione
- Rimozione immediata senza verifica

**Impatto**:
- Stanze valide possono scomparire dalla lista temporaneamente
- Esperienza utente confusa (stanze che appaiono e scompaiono)
- Possibili race conditions durante il join

---

## 2. Problemi Rete WiFi Locale (Senza Internet)

### 2.1 ❌ HTTP Server Non Implementato (Solo Simulato)

**Problema**: L'HTTP server per il trasferimento file è solo simulato, non implementato realmente.

**Evidenza**:
```116:138:src/services/NetworkService.ts
async startHttpServer(): Promise<string | null> {
  const hostAddress = await this.getHostAddress();
  if (!hostAddress) {
    console.warn('Cannot start HTTP server: no local IP');
    return null;
  }

  console.log(`HTTP server would start at http://${hostAddress}`);
  
  // In production, implement actual HTTP server
  // For now, return the address
  return hostAddress;
}
```

**Impatto Critico**:
- **I file audio NON possono essere scaricati realmente**
- Gli endpoint `/files/{fileId}` non esistono
- Il trasferimento file è completamente non funzionante
- L'app non può funzionare come host reale

**Soluzione Necessaria**:
- Implementare server HTTP nativo usando libreria come:
  - `react-native-http-bridge` (Android/iOS)
  - `react-native-http-server` (Android)
  - Modulo nativo custom
- Implementare endpoint:
  - `GET /files/{fileId}` - Download file con streaming
  - `GET /files` - Lista file condivisi
  - `POST /join` - Join request con validazione token
  - `GET /room` - Room state

---

### 2.2 ❌ WebSocket Server Non Implementato (Solo Simulato)

**Problema**: Il server WebSocket per coordinazione real-time è solo simulato.

**Evidenza**:
```148:169:src/services/NetworkService.ts
async connectToHost(
  hostAddress: string,
  sessionToken: string,
  peerId: string,
  peerName: string
): Promise<boolean> {
  try {
    // In production, create actual WebSocket connection
    // const ws = new WebSocket(`ws://${hostAddress}/room`);
    
    console.log(`Connecting to host at ${hostAddress}`);
    
    // Simulate successful connection
    return true;
  } catch (error) {
    console.error('Failed to connect to host:', error);
    return false;
  }
}
```

**Impatto Critico**:
- **Nessuna sincronizzazione real-time tra peer**
- I file condivisi non vengono propagati agli altri peer
- Gli aggiornamenti di stato non vengono trasmessi
- I peer non vengono notificati quando altri peer si connettono/disconnettono
- Il sistema di messaggi (`sendMessage`) non funziona

**Soluzione Necessaria**:
- Implementare server WebSocket nativo
- Gestire connessioni multiple (host + tutti i guest)
- Implementare heartbeat (PING/PONG)
- Gestire riconnessioni automatiche
- Broadcast messaggi a tutti i peer connessi

---

### 2.3 ❌ Download File Non Implementato (Solo Simulato)

**Problema**: Il download dei file è completamente simulato, non scarica realmente i file.

**Evidenza**:
```188:212:src/services/NetworkService.ts
async downloadFile(
  ownerAddress: string,
  fileId: string,
  onProgress: (progress: number) => void
): Promise<string | null> {
  const url = `http://${ownerAddress}/files/${fileId}`;
  
  console.log(`Downloading file from ${url}`);
  
  // In production, use fetch with streaming:
  // const response = await fetch(url);
  // const reader = response.body?.getReader();
  // ... stream to file
  
  // Simulate download progress
  for (let i = 0; i <= 100; i += 10) {
    await new Promise(resolve => setTimeout(resolve, 200));
    onProgress(i);
  }
  
  // Return local path where file was saved
  return null; // Would return actual path
}
```

**Impatto Critico**:
- **Nessun file viene realmente scaricato**
- Il progresso mostrato è fittizio
- I file non vengono salvati nel filesystem
- L'intera funzionalità core dell'app non funziona

**Soluzione Necessaria**:
- Implementare fetch con streaming
- Usare `expo-file-system` per salvare file
- Implementare supporto Range headers per resume
- Gestire errori di rete e retry
- Calcolare checksum per verifica integrità

---

### 2.4 ❌ Sincronizzazione File Non Implementata

**Problema**: La sincronizzazione dei file condivisi dal host ai guest non è implementata.

**Evidenza**:
```317:344:src/services/RoomService.ts
private async syncSharedFilesFromHost(): Promise<void> {
  const roomStore = useRoomStore.getState();
  
  if (this.currentRole !== RoomRole.GUEST || !this.hostAddress) {
    return;
  }

  console.log('Syncing shared files from host...');
  console.log('⚠️ File sync not yet implemented - files will be synchronized via WebSocket in production');
  
  // TODO: In production, make HTTP/WebSocket request to host:
  // const response = await fetch(`http://${this.hostAddress}/api/files`);
  // const files: SharedFileMetadata[] = await response.json();
  // roomStore.updateSharedFiles(files);
  
  // For MVP: Files will be synchronized via WebSocket messages
  // when a guest joins, the host should send INDEX_UPDATED message
  // with all shared files. For now, this is a placeholder.
}
```

**Impatto**:
- I guest non vedono i file condivisi dal host
- I guest non vedono i file condivisi da altri guest
- L'indice file è vuoto per i guest
- L'app non può funzionare come sistema di condivisione

**Soluzione Necessaria**:
- Implementare endpoint HTTP `GET /files` sul host
- Inviare messaggio WebSocket `INDEX_UPDATED` quando un guest si connette
- Inviare `INDEX_UPDATED` quando file vengono aggiunti/rimossi
- Gestire merge di indici da multiple fonti

---

### 2.5 ⚠️ Rilevamento Rete WiFi Non Affidabile

**Problema**: Il rilevamento della connessione WiFi si basa su `expo-network` che può non funzionare correttamente su reti isolate.

**Evidenza**:
```46:72:src/services/NetworkService.ts
async initialize(): Promise<NetworkCapabilities> {
  try {
    // Get network state
    const networkState = await Network.getNetworkStateAsync();
    const ipAddress = await Network.getIpAddressAsync();

    this.localIpAddress = ipAddress;
    this.isInitialized = true;

    const wifiAvailable = networkState.type === Network.NetworkStateType.WIFI;

    return {
      bleAvailable: true, // Assume BLE is available, checked separately
      wifiAvailable,
      localIpAddress: wifiAvailable ? ipAddress : null,
      transportMode: wifiAvailable ? TransportMode.WIFI_LAN : TransportMode.BLE_ONLY,
    };
  } catch (error) {
    console.error('Network initialization failed:', error);
    return {
      bleAvailable: true,
      wifiAvailable: false,
      localIpAddress: null,
      transportMode: TransportMode.BLE_ONLY,
    };
  }
}
```

**Problemi**:
- `expo-network` può non rilevare correttamente WiFi senza gateway Internet
- Alcune reti WiFi isolate potrebbero non essere rilevate
- L'IP address potrebbe non essere disponibile anche se WiFi è connesso
- Nessun fallback o retry se il rilevamento fallisce

**Impatto**:
- L'app potrebbe pensare che WiFi non sia disponibile anche quando lo è
- Fallback a BLE-only quando WiFi sarebbe disponibile
- Performance degradate per trasferimenti file

---

### 2.6 ⚠️ Nessuna Gestione Reti Isolate (WiFi senza Gateway)

**Problema**: L'app non gestisce esplicitamente il caso di reti WiFi isolate (senza gateway Internet).

**Evidenza**: Non c'è codice che verifica esplicitamente se la rete ha gateway Internet o meno. L'app assume che se WiFi è disponibile, può essere usato.

**Problemi**:
- Alcune API di rete potrebbero fallire se cercano di raggiungere Internet
- DNS potrebbe non funzionare su reti isolate
- Alcune librerie potrebbero aspettarsi connessione Internet

**Impatto**:
- Comportamenti imprevisti su reti WiFi completamente isolate
- Possibili timeout o errori se codice cerca di raggiungere server esterni
- Difficoltà nel debugging

**Soluzione Necessaria**:
- Verificare esplicitamente che la rete sia locale-only
- Disabilitare qualsiasi chiamata a server esterni
- Usare solo indirizzi IP locali (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- Evitare risoluzione DNS

---

### 2.7 ❌ Nessuna Gestione Firewall/NAT

**Problema**: L'app non gestisce problemi di firewall o NAT che potrebbero bloccare connessioni peer-to-peer.

**Evidenza**: Non c'è codice che verifica se le connessioni sono bloccate da firewall o NAT.

**Problemi**:
- Alcuni router WiFi bloccano connessioni peer-to-peer
- NAT può impedire connessioni dirette
- Firewall del dispositivo può bloccare porte

**Impatto**:
- Trasferimenti file possono fallire silenziosamente
- Difficile diagnosticare il problema
- Esperienza utente frustrante

**Soluzione Necessaria**:
- Implementare test di connettività durante il join
- Fornire messaggi di errore chiari se connessione bloccata
- Suggerire soluzioni (disabilitare firewall, configurare router)
- Fallback a BLE se WiFi non funziona

---

## 3. Problemi di Integrazione BLE + WiFi

### 3.1 ⚠️ Transizione BLE → WiFi Non Robusta

**Problema**: La transizione da handshake BLE a connessione WiFi non gestisce correttamente i fallback.

**Evidenza**:
```216:235:src/services/RoomService.ts
// If Wi-Fi is available, connect via LAN
if (room.wifiAvailable && roomInfo.hostAddress) {
  const connected = await networkService.connectToHost(
    roomInfo.hostAddress,
    this.sessionToken!,
    appStore.deviceId,
    appStore.deviceName
  );

  if (!connected) {
    console.warn('LAN connection failed, using BLE-only mode');
    appStore.updateNetworkCapabilities({
      wifiAvailable: false,
      transportMode: TransportMode.BLE_ONLY,
    });
  } else {
    // After connecting via LAN, synchronize shared files from host
    await this.syncSharedFilesFromHost();
  }
}
```

**Problemi**:
- Se WiFi fallisce, l'app passa a BLE-only ma non implementa trasferimenti BLE
- Il sessionToken potrebbe non essere valido se generato lato guest
- Nessun retry se la connessione WiFi fallisce temporaneamente
- La sincronizzazione file viene chiamata anche se non implementata

**Impatto**:
- Se WiFi non funziona, l'app entra in uno stato inconsistente
- I guest non possono scaricare file anche se connessi
- Esperienza utente confusa

---

### 3.2 ⚠️ Dati Inconsistenti tra BLE e WiFi

**Problema**: I dati recuperati via BLE (advertisement) possono essere diversi da quelli via WiFi, causando inconsistenze.

**Evidenza**:
```204:214:src/services/RoomService.ts
// Create room info - use roomName from response if available (full name from host)
const roomInfo: RoomInfo = {
  roomId: room.roomId,
  roomName: response.roomName || room.roomName, // Use full name from host response
  hostId: room.hostId,
  hostName: room.hostName,
  hostAddress: response.hostAddress || room.hostAddress,
  wifiAvailable: room.wifiAvailable,
  peerCount: room.peerCount,
  createdAt: room.createdAt,
};
```

**Problemi**:
- `roomName` da BLE è spesso un placeholder generico
- `hostAddress` potrebbe non essere disponibile via BLE
- Nessuna verifica che i dati siano consistenti
- Possibili race conditions se dati cambiano durante il join

**Impatto**:
- UI mostra dati inconsistenti
- Possibili errori se hostAddress è null quando dovrebbe essere disponibile
- Difficile debuggare problemi

---

### 3.3 ❌ Nessun Meccanismo di Fallback BLE per Trasferimenti

**Problema**: Se WiFi non è disponibile, l'app passa a BLE-only mode ma non implementa trasferimenti via BLE.

**Evidenza**: Il codice menziona `TransportMode.BLE_ONLY` ma non c'è implementazione per trasferimenti file via BLE.

**Impatto**:
- In modalità BLE-only, i file non possono essere scaricati
- L'app è inutilizzabile senza WiFi
- Gli utenti non possono usare l'app in ambienti senza WiFi

**Soluzione Necessaria**:
- Implementare protocollo di trasferimento file via BLE GATT
- Chunking dei file in pacchetti piccoli (512 bytes)
- Sistema di ACK e retry
- Progress tracking per trasferimenti lenti

---

## 4. Raccomandazioni e Soluzioni

### 4.1 Priorità CRITICA (Blocca Funzionalità Core)

#### 4.1.1 Implementare HTTP Server Reale
- **Libreria Consigliata**: `react-native-http-bridge` o modulo nativo custom
- **Endpoint Necessari**:
  - `GET /files/{fileId}` - Streaming file con supporto Range headers
  - `GET /files` - Lista file condivisi (JSON)
  - `POST /join` - Validazione join request con sessionToken
  - `GET /room` - Room state (peers, files)
- **Requisiti**:
  - Streaming chunked per file grandi
  - Supporto Range headers per resume
  - Validazione sessionToken
  - CORS headers per connessioni cross-origin

#### 4.1.2 Implementare WebSocket Server Reale
- **Libreria Consigliata**: `react-native-websocket` o modulo nativo
- **Funzionalità**:
  - Gestione connessioni multiple (host + guest)
  - Heartbeat (PING/PONG) ogni 30 secondi
  - Broadcast messaggi a tutti i peer
  - Riconnessione automatica con backoff esponenziale
- **Messaggi da Implementare**:
  - `INDEX_UPDATED` - Sincronizzazione file
  - `PEER_JOINED` / `PEER_LEFT` - Gestione peer
  - `SHARE_FILES` / `UNSHARE_FILES` - Condivisione file
  - `TRANSFER_STARTED` / `TRANSFER_PROGRESS` / `TRANSFER_COMPLETED` - Tracking trasferimenti

#### 4.1.3 Implementare Download File Reale
- **Usare**: `expo-file-system` per salvataggio
- **Funzionalità**:
  - Fetch con streaming usando `response.body.getReader()`
  - Salvataggio incrementale su filesystem
  - Progress tracking accurato
  - Supporto resume con Range headers
  - Verifica checksum dopo download
  - Gestione errori e retry

#### 4.1.4 Implementare Sincronizzazione File
- **Flusso**:
  1. Guest si connette → Host invia `INDEX_UPDATED` con tutti i file
  2. Peer condivide file → Broadcast `INDEX_UPDATED` a tutti
  3. Peer rimuove file → Broadcast `UNSHARE_FILES`
- **Gestione**:
  - Merge intelligente di indici (evitare duplicati)
  - Aggiornamento UI in real-time
  - Gestione conflitti (stesso fileId da peer diversi)

---

### 4.2 Priorità ALTA (Funzionalità Importanti)

#### 4.2.1 Completare Handshake BLE GATT
- **Implementare**:
  - Scrittura join request in GATT characteristic
  - Lettura risposta dal host
  - Validazione sessionToken lato host
  - Recupero dati completi (roomName, hostAddress) via GATT
- **Sicurezza**:
  - SessionToken generato solo lato host
  - Validazione peerId durante handshake
  - Timeout per connessioni GATT

#### 4.2.2 Migliorare Parsing BLE Advertisement
- **Validazione Robusta**:
  - Schema validation per dati parsati
  - Checksum o hash per verifica integrità
  - Logging dettagliato per debugging
- **Fallback Intelligente**:
  - Priorità: Service data → Manufacturer data → Device name
  - Verifica consistenza dati tra formati
  - Errori chiari se parsing fallisce

#### 4.2.3 Gestione Reti WiFi Isolate
- **Verifiche**:
  - Test connettività locale (ping a IP locale)
  - Verifica che IP sia in range privato (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  - Disabilitare qualsiasi chiamata DNS o Internet
- **Messaggi Utente**:
  - Avviso se rete non ha gateway Internet (normale per uso locale)
  - Istruzioni per configurare rete isolata

---

### 4.3 Priorità MEDIA (Miglioramenti)

#### 4.3.1 Implementare BLE Transfer Fallback
- **Protocollo**:
  - Chunk size: 512 bytes (MTU-dependent)
  - Sequence numbers per ordinamento
  - ACK ogni 8 chunks
  - Retry su timeout
  - Checksum finale
- **Performance**:
  - Throughput atteso: 50-200 KB/s
  - Progress tracking accurato
  - Pausa/resume support

#### 4.3.2 Migliorare Cleanup Dispositivi
- **Strategia**:
  - Threshold dinamico basato su RSSI
  - Retry prima di rimuovere dispositivo
  - Verifica attiva (ping) prima di rimuovere
  - UI feedback quando stanza scompare

#### 4.3.3 Gestione Firewall/NAT
- **Diagnostica**:
  - Test connettività durante join
  - Rilevamento porte bloccate
  - Messaggi di errore chiari
- **Soluzioni**:
  - Suggerimenti per configurare router
  - Fallback automatico a BLE se WiFi bloccato
  - Istruzioni per disabilitare firewall temporaneamente

---

### 4.4 Priorità BASSA (Nice to Have)

#### 4.4.1 Implementare iOS BLE Advertising
- **Modulo Nativo iOS**:
  - Usare `CBPeripheralManager`
  - Bridge Objective-C/Swift
  - Gestione permessi iOS

#### 4.4.2 Ottimizzazione Dati BLE
- **Compressione**:
  - Usare encoding più efficiente (non ASCII)
  - Compressione JSON se possibile
  - Hash invece di ID completi dove possibile

#### 4.4.3 Metriche e Monitoring
- **Tracking**:
  - Tempo discovery
  - Successo rate connessioni
  - Throughput trasferimenti
  - Errori comuni

---

## 5. Priorità di Intervento

### 🔴 CRITICO - Blocca Funzionalità Core
1. **HTTP Server** - Senza questo, i file non possono essere scaricati
2. **WebSocket Server** - Senza questo, non c'è sincronizzazione real-time
3. **Download File Reale** - Core feature dell'app
4. **Sincronizzazione File** - Guest devono vedere file condivisi

### 🟠 ALTO - Funzionalità Importanti
5. **Handshake BLE GATT Completo** - Sicurezza e dati corretti
6. **Parsing BLE Robusto** - Discovery affidabile
7. **Gestione Reti Isolate** - Funzionamento su WiFi senza Internet

### 🟡 MEDIO - Miglioramenti
8. **BLE Transfer Fallback** - Funzionamento senza WiFi
9. **Cleanup Dispositivi Migliorato** - UX migliore
10. **Gestione Firewall** - Diagnostica problemi

### 🟢 BASSO - Nice to Have
11. **iOS BLE Advertising** - Supporto iOS completo
12. **Ottimizzazione Dati BLE** - Performance migliori
13. **Metriche** - Monitoring e debugging

---

## 📊 Riepilogo Problemi

| Categoria | Problemi Critici | Problemi Alti | Problemi Medi | Totale |
|-----------|------------------|---------------|---------------|--------|
| **BLE Signaling** | 1 | 3 | 2 | 6 |
| **WiFi Locale** | 4 | 2 | 1 | 7 |
| **Integrazione** | 1 | 2 | 0 | 3 |
| **TOTALE** | **6** | **7** | **3** | **16** |

---

## 🎯 Conclusione

L'app **Pandemic** ha un'architettura ben progettata ma manca dell'implementazione di funzionalità critiche per il trasferimento file. I problemi principali sono:

1. **HTTP/WebSocket server non implementati** - Blocca completamente i trasferimenti
2. **Download file simulato** - Core feature non funzionante
3. **BLE handshake incompleto** - Problemi di sicurezza e dati
4. **Sincronizzazione file mancante** - Guest non vedono file condivisi

Con l'implementazione delle soluzioni critiche, l'app può diventare funzionale per lo scambio file audio locale. Le soluzioni ad alta priorità miglioreranno affidabilità e sicurezza, mentre quelle a media/bassa priorità ottimizzeranno l'esperienza utente.

---

**Report Generato**: 2024  
**Versione Codebase Analizzata**: Corrente  
**Autore**: Analisi Automatica Codebase

