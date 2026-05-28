@echo off
chcp 65001 >nul 2>&1
set NODE_OPTIONS=--max-old-space-size=512
node index.js %*