#!/bin/bash
# Script opzionale per creare automaticamente GitHub Release
# Richiede: GitHub CLI (gh) installato e autenticato

set -e

VERSION=${1:-"v1.2.0"}
RELEASE_DIR="release"

if [ ! -d "$RELEASE_DIR" ]; then
    echo "❌ Release directory not found. Run: npm run release:prepare"
    exit 1
fi

# Verifica GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found."
    echo "   Install: https://cli.github.com/"
    echo "   Or create release manually: https://github.com/YOUR_USERNAME/Pandemic/releases/new"
    exit 1
fi

# Verifica autenticazione
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "   Run: gh auth login"
    exit 1
fi

echo "🚀 Creating GitHub Release: $VERSION"
echo ""

# Crea release draft
gh release create "$VERSION" \
    --title "🦠 Pandemic $VERSION" \
    --notes-file "$RELEASE_DIR/README.md" \
    --draft \
    "$RELEASE_DIR"/*

echo ""
echo "✅ Draft release created: $VERSION"
echo "📝 Review and publish at: https://github.com/$(gh repo view --json owner,name -q '.owner.login + "/" + .name')/releases"
echo ""
echo "To publish: gh release publish $VERSION"
