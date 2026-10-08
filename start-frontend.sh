#!/bin/bash
# Starts the website for development.
cd "$(dirname "$0")/frontend" || exit 1
[ -d node_modules ] || npm install
npm run dev
