#!/bin/bash
# Script per preparare i file per GitHub Release
# Include: APK Android + Binari Venue Host

set -e

RELEASE_DIR="release"
VERSION=${1:-"v1.2.0"}

echo "📦 Preparing release: $VERSION"
echo ""

# Crea directory release
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# 1. Build APK Android RELEASE (non debug!)
# IMPORTANTE: Usiamo app-release.apk (ottimizzato, senza debug) non app-debug.apk
APK_RELEASE="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_RELEASE" ]; then
    echo "🔨 Building Android APK (RELEASE build)..."
    cd android
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew assembleRelease
    cd ..
else
    echo "✅ APK RELEASE found: $APK_RELEASE"
fi

# Copia APK RELEASE (non debug!)
if [ -f "$APK_RELEASE" ]; then
    cp "$APK_RELEASE" "$RELEASE_DIR/pandemic-android-$VERSION.apk"
    echo "✅ Copied RELEASE APK to release/"
else
    echo "❌ RELEASE APK not found! Run: npm run build:android:release"
    echo "   ⚠️  NOT using debug APK - release build required for distribution"
    exit 1
fi

# 2. Build Venue Host binari
echo ""
echo "🔨 Building Venue Host executables..."
cd venue-host
npm run pkg:all
cd ..

# Copia binari venue-host
if [ -d "venue-host/bin" ]; then
    echo "✅ Copying venue-host executables..."
    cp venue-host/bin/pandemic-venue-host-* "$RELEASE_DIR/" 2>/dev/null || true
    echo "✅ Copied venue-host executables to release/"
else
    echo "❌ Venue host binari not found!"
    exit 1
fi

# 3. Crea README per la release
cat > "$RELEASE_DIR/README.md" << EOF
# 🦠 Pandemic $VERSION - Release Files

## 📱 Android App

- **pandemic-android-$VERSION.apk** - Install su dispositivi Android

### Installazione
1. Scarica l'APK
2. Abilita "Origini sconosciute" nelle impostazioni Android
3. Apri il file APK e installa

## 🖥️ Venue Host (Dashboard Web)

Eseguibili standalone per far girare il venue host su laptop/desktop:

| Piattaforma | File | Istruzioni |
|-------------|------|------------|
| **macOS (Apple Silicon)** | \`pandemic-venue-host-macos-arm64\` | Doppio click o \`./pandemic-venue-host-macos-arm64\` |
| **macOS (Intel)** | \`pandemic-venue-host-macos-x64\` | Doppio click o \`./pandemic-venue-host-macos-x64\` |
| **Windows** | \`pandemic-venue-host-win-x64.exe\` | Doppio click per avviare |
| **Linux** | \`pandemic-venue-host-linux-x64\` | \`chmod +x pandemic-venue-host-linux-x64 && ./pandemic-venue-host-linux-x64\` |

### Come Usare Venue Host

1. **Scarica** l'eseguibile per la tua piattaforma
2. **Esegui** l'eseguibile (doppio click o da terminale)
3. Si apre automaticamente il browser su **http://localhost:8787**
4. **Crea una room** nella dashboard
5. **Carica file audio** se vuoi condividerli come host
6. I telefoni sulla stessa rete Wi-Fi vedranno automaticamente la room

### Requisiti

- **Android App**: Android 10+ (API 29+)
- **Venue Host**: Nessun requisito (eseguibile standalone, no Node.js richiesto)
- **Rete**: Tutti i dispositivi devono essere sulla stessa rete Wi-Fi

## 📖 Documentazione

Vedi il [README principale](../../README.md) per istruzioni complete.

## 🐛 Problemi Noti

- **Android 10-11**: La discovery automatica può essere intermittente. Usa "Connessione Manuale" o Hotspot Mode.
- Vedi [ANDROID_DISCOVERY_ISSUES.md](../../ANDROID_DISCOVERY_ISSUES.md) per dettagli.

---

**Versione**: $VERSION  
**Data Release**: $(date +"%Y-%m-%d")
EOF

echo ""
echo "✅ Release files prepared in: $RELEASE_DIR/"
echo ""
echo "📋 Files ready for GitHub Release:"
ls -lh "$RELEASE_DIR" | tail -n +2 | awk '{print "   " $9 " (" $5 ")"}'
echo ""
echo "📝 Next steps:"
echo "   1. Review files in $RELEASE_DIR/"
echo "   2. Create GitHub Release: https://github.com/YOUR_USERNAME/Pandemic/releases/new"
echo "   3. Upload all files from $RELEASE_DIR/"
echo "   4. Copy README.md content as release notes"
echo ""
