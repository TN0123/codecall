#!/bin/bash

npm run compile

cursor --extensionDevelopmentPath="$PWD" &

concurrently "npx tsx watch server.ts" "tsc -watch -p ./" "node esbuild.js --watch"
