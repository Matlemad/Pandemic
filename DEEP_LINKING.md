# 🔗 PANDEMIC - Deep Linking Configuration

## ✅ Configurazione Attuale

La tua configurazione è già corretta! Abbiamo:

```json
{
  "expo": {
    "scheme": "pandemic",
    "ios": {
      "bundleIdentifier": "com.pandemic.app"
    },
    "android": {
      "package": "com.pandemic.app"
    }
  }
}
```

## 🎯 Come Funziona con Expo Router

Con **expo-router**, il deep linking è gestito **automaticamente**. Non serve configurazione aggiuntiva!

### Schema URL

- **Custom scheme**: `pandemic://`
- **Bundle ID scheme** (fallback): `com.pandemic.app://`
- **Routes** sono mappate automaticamente in base alla struttura `app/`

### Esempi

```
pandemic://                    → Home (app/index.tsx)
pandemic://host                → Host Screen (app/host.tsx)
pandemic://join                → Join Screen (app/join.tsx)
pandemic://room                → Room Screen (app/room.tsx)
pandemic://library             → Library Screen (app/library.tsx)
pandemic://settings            → Settings Screen (app/settings.tsx)
```

## 🧪 Test Deep Linking

### In Expo Go

```bash
# Test home
npx uri-scheme open exp://127.0.0.1:8081/--/ --ios

# Test room screen
npx uri-scheme open exp://127.0.0.1:8081/--/room --android
```

**Nota:** In Expo Go usa `exp://` invece di `pandemic://`

### In Build Nativo (dopo prebuild)

```bash
# Test home
npx uri-scheme open pandemic:// --ios

# Test room screen
npx uri-scheme open pandemic://room --android

# Test library
npx uri-scheme open pandemic://library --ios
```

## 📱 Test Manuale

### Android

1. Apri Chrome/Safari sul device
2. Vai su: `pandemic://room`
3. L'app si aprirà automaticamente sulla schermata Room

### iOS

1. Apri Safari
2. Vai su: `pandemic://room`
3. Tap "Open" quando chiede di aprire l'app

## 🎨 Navigazione Programmata

Puoi anche navigare programmaticamente usando `expo-router`:

```typescript
import { router } from 'expo-router';

// Naviga a una schermata
router.push('/room');
router.push('/library');
router.push('/settings');

// Naviga con parametri (se configurati)
router.push({
  pathname: '/room',
  params: { roomId: 'abc123' }
});
```

## ⚠️ Note Importanti

1. **Expo Router gestisce tutto** - Non serve configurare `Linking.useURL()` manualmente
2. **File-based routing** - Le route sono determinate dalla struttura delle cartelle in `app/`
3. **Deep linking funziona automaticamente** - Una volta configurato lo `scheme` in `app.json`

## 🔍 Verifica Configurazione

Per verificare che tutto sia configurato correttamente:

```bash
# Verifica schema
npx uri-scheme list

# Dovrebbe mostrare:
# pandemic
# com.pandemic.app
```

---

**✅ La tua configurazione è già corretta e funzionante!**

*Ultimo aggiornamento: v1.0.0*

