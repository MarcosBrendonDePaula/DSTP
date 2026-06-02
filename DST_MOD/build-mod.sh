#!/usr/bin/env bash
# Build a clean copy of the DSTP mod ready for the Steam Workshop.
#
# The ModUploader publishes EVERYTHING in the mod folder — it doesn't honor
# .gitignore. So never point it at a dev folder containing scripts_extracted/
# (269MB of vanilla Klei scripts) or specs/ (internal docs). This script copies
# only the files that belong in the published mod into the game's mods/DSTP.
#
# Usage:  bash DST_MOD/build-mod.sh
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"           # DST_MOD/
DST="E:/SteamLibrary/steamapps/common/Don't Starve Together/mods/DSTP"

echo "Building clean mod -> $DST"
rm -rf "$DST"
mkdir -p "$DST/scripts/dstp"

# Mod metadata + assets
cp "$SRC/modinfo.lua"   "$DST/"
cp "$SRC/modmain.lua"   "$DST/"
cp "$SRC/modicon.tex"   "$DST/"
cp "$SRC/modicon.xml"   "$DST/"
cp "$SRC/CHANGELOG.md"  "$DST/"

# Runtime Lua only (NOT scripts_extracted, NOT specs)
cp "$SRC/scripts/dstp/"*.lua "$DST/scripts/dstp/"

echo "Done. Published mod contents:"
find "$DST" -type f | sed "s#$DST/##" | sort
echo ""
echo "Total size:"
du -sh "$DST"
