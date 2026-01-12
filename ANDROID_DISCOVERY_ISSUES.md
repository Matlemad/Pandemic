# 🔍 Android Discovery Issues - mDNS/NSD

## ⚠️ Stato Attuale

**Android 12+ (API 31+)**: Discovery funziona correttamente ✅  
**Android 10-11 (API 29-30)**: Discovery **intermittente o non funzionante** ⚠️

> **Workaround per utenti Android 10-11**: Usa **"Connessione Manuale"** (inserendo IP) o **Hotspot Mode** dove il dispositivo moderno fa da host.

## Panoramica

Questo documento descrive i problemi noti con la discovery mDNS (Network Service Discovery) su Android, in particolare sui dispositivi più vecchi (API 29-30), e i workaround implementati.

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

### 2. Discovery Viene Fermata Continuamente (RISOLTO ✅)

**Problema**: La discovery veniva fermata ogni volta che veniva trovata una nuova stanza, causando la perdita di tutte le risoluzioni in corso.

**Causa Root**: Il `useEffect` in `app/join.tsx` aveva dipendenze `[venueHosts.length, discoveredRooms.length]`, causando:
1. Discovery trova servizio → risoluzione inizia
2. Servizio risolto → `venueHosts.length` cambia
3. **useEffect cleanup viene eseguito** → ferma la discovery
4. **useEffect ri-eseguito** → chiama `startScan()` che svuota la lista
5. Ciclo infinito di start/stop/clear

**Fix Implementato**: **useEffect con dipendenze vuote**
- `useEffect` principale ora ha `[]` (vuoto) → eseguito solo al mount/unmount
- Refresh periodico usa `useRef` per leggere lo stato senza causare re-render
- Discovery non viene più fermata quando cambia il numero di stanze

**Codice**: `app/join.tsx`
```typescript
// Prima (BUG):
useEffect(() => {
  startScan();
  return () => stopVenueDiscovery();
}, [venueHosts.length, discoveredRooms.length]); // ❌ Causa re-esecuzione continua

// Dopo (FIX):
useEffect(() => {
  startScan(false); // Non svuota lista esistente
  return () => stopVenueDiscovery();
}, []); // ✅ Solo mount/unmount
```

---

### 3. Discovery Non Funziona Dopo Riavvio Schermata

**Problema**: Quando l'utente esce dalla schermata "Trova Stanze" e rientra, la discovery potrebbe non trovare più le stanze. Il problema è causato da risoluzioni pendenti nel `NsdManager` che non possono essere cancellate.

**Sintomi**:
- Prima volta: la discovery funziona correttamente
- Dopo uscita/rientro: le stanze potrebbero non essere più trovate
- Nei log: `Service discovered` ma nessun `Service resolved`

**Workaround Implementato**: **Release NsdManager + Delay**
1. Quando la discovery si ferma, il `NsdManager` viene rilasciato (`nsdManager = null`)
2. Questo cancella tutte le risoluzioni pendenti
3. Quando si riavvia, viene creato un nuovo `NsdManager`
4. Delay di 1.5s prima di riavviare per dare tempo al sistema di pulire lo stato

**Nota**: Con la fix del bug #2, questo problema è meno frequente perché la discovery non viene più fermata continuamente.

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

### 4. mDNS Non Funziona su Android Vecchi (API 30-)

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

## 📋 Limitazioni Rimanenti e Raccomandazioni

### Discovery NON affidabile su Android 10-11

Nonostante tutti i workaround implementati (coda sequenziale, multicast lock, retry con backoff), la discovery mDNS su Android 10-11 **rimane intermittente**. Questo sembra essere un bug strutturale nel `NsdManager` di Android.

**Comportamento osservato**:
- Il dispositivo **può creare stanze** (advertising funziona) ✅
- Il dispositivo **non riesce a trovare stanze** (discovery fallisce) ❌
- `errorCode: 3` (ALREADY_ACTIVE) persiste anche con retry

### Raccomandazioni per Utenti

| Scenario | Soluzione Raccomandata |
|----------|------------------------|
| Android 12+ → Android 12+ | Discovery automatica ✅ |
| Android 12+ → Android 10-11 | **Android 12+ crea la stanza**, Android vecchio si connette manualmente |
| Android 10-11 → qualsiasi | Crea la stanza da Android vecchio, gli altri si connettono via discovery |
| Venue Host + Android vecchio | Usa **Connessione Manuale** (IP + porta) |

### Connessione Manuale

L'app mostra un pulsante prominente "📶 Connetti Manualmente" per dispositivi Android vecchi. L'utente può inserire:
- **IP**: Visibile nella console del Venue Host o nella schermata "Crea LAN Room"
- **Porta**: Default `8787`

La connessione manuale **funziona sempre** perché bypassa mDNS.

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

**Ultimo Aggiornamento**: 2026-01-12  
**Versione Codebase**: v1.2+  
**Status**: 
- ✅ Bug discovery fermata continuamente risolto (v1.2+)
- ⚠️ Discovery non funziona su Android 10-11. Usare connessione manuale o hotspot mode.