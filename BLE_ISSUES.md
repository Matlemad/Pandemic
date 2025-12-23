# 🔍 BLE Issues & Solutions

## Problemi Identificati

### 1. ❌ BLE Advertising Non Implementato

**Problema**: La libreria `react-native-ble-plx` **non supporta peripheral mode**, quindi non possiamo fare advertising BLE reale.

**Effetto**: Quando un host crea una stanza, non viene effettivamente trasmessa via BLE, quindi gli altri dispositivi non possono trovarla.

**Evidenza**: 
- Il metodo `startAdvertising()` in `BleService.ts` non fa nulla oltre a impostare un flag
- Le stanze create non vengono scoperte dagli altri dispositivi

**Soluzioni Possibili**:

1. **Implementare native modules** (Android/iOS) per advertising
   - Richiede codice nativo Java/Kotlin per Android
   - Richiede codice Swift/Objective-C per iOS
   - Più complesso ma soluzione definitiva

2. **Usare una libreria alternativa** che supporti advertising
   - Cercare librerie che supportano BLE peripheral mode
   - Verificare compatibilità con Expo

3. **Workaround con GATT Server** (complesso)
   - Creare un GATT server quando si è host
   - I client si connettono al server e leggono i dati della stanza
   - Richiede implementazione nativa o libreria che supporti GATT server creation

4. **Usare device name** (limitato)
   - Cambiare il nome Bluetooth del dispositivo per includere info della stanza
   - Limitato a ~20 caratteri
   - Non funziona su tutti i dispositivi/versioni Android

**Stato Attuale**: ⚠️ Advertising non funziona. Serve implementazione nativa o libreria alternativa.

---

### 2. ✅ Stanza Persa Quando si Esce (RISOLTO)

**Problema**: Quando si creava una stanza e poi si tornava alla home, la stanza veniva persa.

**Causa**: La schermata `host.tsx` non controllava se esisteva già una stanza attiva prima di permettere di crearne una nuova.

**Soluzione Implementata**: 
- Aggiunto check in `host.tsx` che redirige a `/room` se esiste già una stanza attiva
- La stanza rimane nello store Zustand anche quando si naviga via

**File Modificati**: `app/host.tsx`

---

### 3. ✅ Diagnostica BLE (IMPLEMENTATA)

**Aggiunto**: Sistema di diagnostica BLE per aiutare a debuggare problemi.

**Funzionalità**:
- Verifica disponibilità modulo BLE
- Controlla stato Bluetooth
- Verifica permessi (con raccomandazioni per Android)
- Fornisce raccomandazioni specifiche

**Uso**: Impostazioni → "Esegui diagnostica BLE"

**File Creati**: `src/utils/bleDiagnostics.ts`

---

## Test da Fare

1. ✅ Verificare che la stanza non venga persa quando si naviga
2. ❌ Testare BLE advertising (NON FUNZIONA - atteso)
3. ✅ Testare diagnostica BLE
4. ❌ Implementare soluzione per BLE advertising

---

## Prossimi Passi

### Priorità Alta
1. **Implementare BLE Advertising** usando native modules o libreria alternativa
   - Questo è il blocco principale per il funzionamento del MVP
   - Senza advertising, le stanze non possono essere scoperte

### Priorità Media
2. Migliorare gestione errori BLE
3. Aggiungere retry logic per connessioni BLE
4. Implementare timeout per discovery

### Priorità Bassa
5. Ottimizzare consumo batteria durante scanning
6. Aggiungere statistiche BLE (tempo discovery, successo rate, etc.)

---

## Note Tecniche

### Limitazioni `react-native-ble-plx`
- ✅ Supporta BLE Central mode (scanning, connecting, reading/writing GATT)
- ❌ NON supporta BLE Peripheral mode (advertising, GATT server)
- ✅ Cross-platform (Android + iOS)
- ✅ Buona documentazione e supporto

### Alternative da Considerare
- `react-native-bluetooth-serial-next` - Supporta advertising ma solo Android
- Native modules personalizzati - Più controllo ma più complesso
- `react-native-ble-manager` - Verificare supporto advertising

---

**Ultima Modifica**: 2024
**Stato**: ⚠️ BLE Advertising richiede implementazione nativa
