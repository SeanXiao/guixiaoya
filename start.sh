#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

# 构建前端
echo "📦 构建前端..."
npm run build

# 启动单服务
echo "🚀 启动桂小雅（单服务模式）"
echo "  访问: http://127.0.0.1:8787"
echo ""
npm run api
