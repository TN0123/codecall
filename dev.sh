#!/bin/bash

npm run compile

cursor --extensionDevelopmentPath="$PWD" &

concurrently "tsc -watch -p ./" "node esbuild.js --watch"
