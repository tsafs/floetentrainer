#!/usr/bin/env bash
# Baut das Liederheft (Schwarz-Weiß) nach pdf/Liederheft-Blockfloete-sw.pdf
set -e
cd "$(dirname "$0")"
python3 build2.py
node topdf.js liederheft2-sw
node overflow.js liederheft2-sw   # Unterkante je Seite in mm (Folio sitzt bei 286)
cp out/liederheft2-sw.pdf pdf/Liederheft-Blockfloete-sw.pdf
echo "fertig: pdf/Liederheft-Blockfloete-sw.pdf"
