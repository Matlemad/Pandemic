# 🔍 Android Discovery Issues - mDNS/NSD

## Panoramica

Questo documento descrive i problemi noti con la discovery mDNS (Network Service Discovery) su Android, in particolare sui dispositivi più vecchi (API 30 e precedenti), e i workaround implementati.

---

## 🐛 Problemi Noti

### 1. Error Code 3 (FAILURE_ALREADY_ACTIVE)

**Problema**: Android `NsdManager` può risolvere **solo UN servizio alla volta**. Quando vengono scoperti più servizi contemporaneamente (ad esempio, una stanza creata da mobile e un Venue Host), i tentativi di risoluzione successivi falliscono con `errorCode: 3` (ALREADY_ACTIVE).

**Sintomi**:
- La discovery trova i servizi (`onServiceFound` viene chiamato)
- Ma la risoluzione fallisce con `onResolveFailed(errorCode: 3)`
- Le stanze non appaiono nella lista UI

**Workaround Implementato**: **Coda di Risoluzione Sequenziale**
- I servizi scoperti vengono aggiunti a una coda FIFO
- Viene risolto **un servizio alla volta**
- Quando una risoluzione finisce (successo o errore), si passa al prossimo nella coda

**Codice**: `android/app/src/main/java/com/pandemic/app/venue/VenueDiscoveryModule.kt`
```kotlin
// Resolution queue - Android NSD can only resolve ONE service at a time
private val resolutionQueue = java.util.concurrent.ConcurrentLinkedQueue<NsdServiceInfo>()
private var isResolving = false

private fun processResolutionQueue() {
    if (isResolving) return
    val nextService = resolutionQueue.poll() ?: return
    isResolving = true
    resolveService(nextService)
    // In onServiceResolved/onResolveFailed: isResolving = false; processResolutionQueue()
}
```

---

### 2. Discovery Non Funziona Dopo Riavvio Schermata

**Problema**: Quando l'utente esce dalla schermata "Trova Stanze" e rientra, la discovery non trova più le stanze. Il problema è causato da risoluzioni pendenti nel `NsdManager` che non possono essere cancellate.

**Sintomi**:
- Prima volta: la discovery funziona correttamente
- Dopo uscita/rientro: le stanze non vengono più trovate
- Nei log: `Service discovered` ma nessun `Service resolved`

**Workaround Implementato**: **Release NsdManager + Delay**
1. Quando la discovery si ferma, il `NsdManager` viene rilasciato (`nsdManager = null`)
2. Questo cancella tutte le risoluzioni pendenti
3. Quando si riavvia, viene creato un nuovo `NsdManager`
4. Delay di 1.5s prima di riavviare per dare tempo al sistema di pulire lo stato

**Codice**: `android/app/src/main/java/com/pandemic/app/venue/VenueDiscoveryModule.kt`
```kotlin
private fun stopDiscoveryInternal() {
    // ... stop discovery ...
    nsdManager = null  // Release per cancellare risoluzioni pendenti
    // ...
}

// In src/venue/discovery.ts
if (this.isDiscovering) {
    await VenueDiscoveryModule.stopDiscovery();
    this.isDiscovering = false;
    await new Promise(resolve => setTimeout(resolve, 1500)); // Delay 1.5s
}
```

---

### 3. mDNS Non Funziona su Android Vecchi (API 30-)

**Problema**: Su Android 10 (API 29) e precedenti, i pacchetti mDNS multicast vengono filtrati quando il dispositivo entra in risparmio energetico. Questo causa la mancata ricezione dei pacchetti di discovery.

**Sintomi**:
- I dispositivi possono **pubblicare** stanze (advertising funziona)
- Ma **non riescono a trovare** altre stanze (discovery fallisce)
- Nessun errore nei log, semplicemente nessun servizio scoperto

**Workaround Implementato**: **WiFi Multicast Lock**
- Quando la discovery inizia, viene acquisito un `WifiManager.MulticastLock`
- Questo mantiene il Wi‑Fi attivo per ricevere pacchetti multicast
- Il lock viene rilasciato quando la discovery si ferma

**Permessi Richiesti**:
```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE"/>
```

**Codice**: `android/app/src/main/java/com/pandemic/app/venue/VenueDiscoveryModule.kt`
```kotlin
private var multicastLock: WifiManager.MulticastLock? = null

private fun acquireMulticastLock() {
    val wifiManager = context.getSystemService(WIFI_SERVICE) as WifiManager
    multicastLock = wifiManager.createMulticastLock("VenueDiscovery")
    multicastLock?.acquire()
}

@ReactMethod
fun startDiscovery(serviceType: String, promise: Promise) {
    acquireMulticastLock()  // Acquire lock per mDNS
    // ... start discovery ...
}
```

---

## 📋 Limitazioni Rimanenti

### 1. Discovery Non Affidabile al 100%

Nonostante i workaround implementati, la discovery mDNS su Android può ancora essere **intermittente**, in particolare su:
- **Android 10 e precedenti** (API 29-)
- **Router con AP isolation abilitato**
- **Reti Wi‑Fi con filtri multicast aggressivi**

**Soluzioni Alternative**:
- **Connessione Manuale**: L'app fornisce un fallback per inserire manualmente l'IP e la porta del Venue Host
- **BLE Advertising**: Le stanze create da mobile sono pubblicate anche via BLE, che è più affidabile per la discovery
- **Refresh Periodico**: La discovery viene riavviata ogni 30 secondi automaticamente

### 2. Venue Host Non Visibile

Su alcuni dispositivi Android vecchi, il **Venue Host** (laptop/Raspberry Pi) potrebbe non essere scoperto, anche se:
- È sulla stessa rete Wi‑Fi
- Il mDNS è configurato correttamente
- Altri dispositivi lo vedono

**Possibili Cause**:
- Router blocca mDNS tra dispositivi (AP isolation)
- Firewall locale sul dispositivo Android
- Limitazioni del sistema operativo Android

**Workaround**: Usa **Connessione Manuale** (opzione nell'UI "Trova Stanze")

---

## 🔧 Troubleshooting

### Debug Log

Per diagnosticare problemi di discovery, controlla i log con:

```bash
# Log nativi Android
adb logcat -s VenueDiscovery:V

# Log Metro/React Native
# Cerca: [VenueDiscovery]
```

**Messaggi Chiave**:
- `Service discovered (before resolve): ...` → La discovery trova il servizio ✅
- `Attempting to resolve: ...` → Sta tentando la risoluzione
- `Service resolved: ... at IP:port` → Risoluzione riuscita ✅
- `Service resolve failed: ... errorCode: 3` → Risoluzione fallita (problema ALREADY_ACTIVE)
- `Multicast lock acquired` → WiFi Multicast Lock attivo (Android vecchi)

### Verifica Permessi

Su Android, assicurati che i permessi siano concessi:

**Android 12+ (API 31+)**:
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `BLUETOOTH_ADVERTISE`
- `ACCESS_FINE_LOCATION`
- `POST_NOTIFICATIONS`

**Android 10-11 (API 29-30)**:
- `ACCESS_FINE_LOCATION` (necessario per BLE e NSD)

**Tutti i Versioni**:
- `CHANGE_WIFI_MULTICAST_STATE` (necessario per mDNS su Android vecchi)
- `ACCESS_NETWORK_STATE`
- `INTERNET`

### Test Discovery

1. **Crea una stanza** su un device Android moderno (API 31+)
2. **Su device Android vecchio** (API 30-):
   - Vai su "Trova Stanze"
   - Aspetta 30 secondi (refresh automatico)
   - Controlla i log per vedere se `Service discovered` appare
3. **Se non appare**:
   - Verifica che siano sulla stessa rete Wi‑Fi
   - Verifica permessi (`CHANGE_WIFI_MULTICAST_STATE`)
   - Prova a riavviare la discovery manualmente (esci e rientra)
   - Usa "Connessione Manuale" come fallback

---

## 📚 Riferimenti

- [Android NsdManager Documentation](https://developer.android.com/reference/android/net/nsd/NsdManager)
- [Android NSD Known Issues](https://issuetracker.google.com/issues?q=componentid:192731%20NsdManager)
- [mDNS/Bonjour Troubleshooting](https://developer.apple.com/bonjour/)
- [Android WiFi Multicast Lock](https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock)

---

**Ultimo Aggiornamento**: 2025-01-11  
**Versione Codebase**: v1.2+  
**Status**: Workaround implementati, ma discovery può essere intermittente su Android vecchi