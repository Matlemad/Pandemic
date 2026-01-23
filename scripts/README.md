# 📦 Release Scripts

Script per preparare e pubblicare GitHub Releases.

## 🚀 Quick Start

### 1. Preparare i file per la release

```bash
npm run release:prepare [VERSION]
```

Esempio:
```bash
npm run release:prepare v1.2.0
```

Questo script:
- ✅ Builda l'APK Android release (firmato)
- ✅ Builda tutti i binari venue-host (Mac/Windows/Linux)
- ✅ Copia tutti i file in `release/`
- ✅ Crea un README.md con istruzioni

### 2. Creare GitHub Release

#### Opzione A: Manuale (Consigliato)

1. Vai su: https://github.com/YOUR_USERNAME/Pandemic/releases/new
2. Tag: `v1.2.0`
3. Title: `🦠 Pandemic v1.2.0`
4. Description: Copia il contenuto di `release/README.md` o `RELEASE_TEMPLATE.md`
5. Upload tutti i file da `release/`
6. Pubblica

#### Opzione B: GitHub CLI (Automatico)

```bash
./scripts/create-github-release.sh v1.2.0
```

**Requisiti:**
- GitHub CLI installato: https://cli.github.com/
- Autenticato: `gh auth login`

Questo crea una **draft release** che puoi rivedere prima di pubblicare.

---

## 📋 File Generati

Dopo `npm run release:prepare`, troverai in `release/`:

```
release/
├── Pandemic-android-release.apk         # App Android (firmata)
├── pandemic-venue-host-macos-arm64       # Mac Apple Silicon
├── pandemic-venue-host-macos-x64         # Mac Intel
├── pandemic-venue-host-win-x64.exe       # Windows
├── pandemic-venue-host-linux-x64         # Linux
└── README.md                             # Istruzioni per utenti
```

---

## 🔧 Script Disponibili

| Script | Descrizione |
|--------|-------------|
| `prepare-release.sh` | Prepara tutti i file per la release |
| `create-github-release.sh` | Crea GitHub Release automaticamente (richiede gh CLI) |

---

## 📝 Note

- I file in `release/` sono ignorati da git (troppo grandi)
- L'APK release viene buildato solo se non esiste già
- I binari venue-host vengono sempre ricostruiti
- Il README.md generato include istruzioni per utenti finali

---

## 🐛 Troubleshooting

**Signing APK (release):**
```bash
# Da android/
export PANDemic_RELEASE_STORE_FILE="pandemic-app.keystore"
export PANDemic_RELEASE_KEY_ALIAS="pandemic-app"
export PANDemic_RELEASE_STORE_PASSWORD="YOUR_PASSWORD"
export PANDemic_RELEASE_KEY_PASSWORD="YOUR_PASSWORD"
```

**APK non trovato:**
```bash
npm run build:android:release
```

**Binari venue-host non trovati:**
```bash
cd venue-host
npm run pkg:all
```

**GitHub CLI non funziona:**
Usa l'opzione manuale (Opzione A) - è più semplice e ti permette di rivedere tutto prima di pubblicare.
