#!/bin/bash
# FileShare 启动/管理脚本
# 首次使用请先运行: bash install.sh
# 用法: ./run.sh {start|stop|restart|status|log}

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/app.log"
PID_FILE="/tmp/fileshare.pid"

mkdir -p "$LOG_DIR"

# Extract PORT from server.js (works on Linux/macOS)
get_port() {
  grep "^const PORT" "$APP_DIR/server.js" | grep -oE '[0-9]+' | head -1 || echo "6606"
}

case "${1:-start}" in
  start)
    echo "Starting FileShare..."
    cd "$APP_DIR"

    # Auto-install if node_modules missing
    if [ ! -d node_modules ]; then
      echo "📦 Installing dependencies..."
      npm install --omit=dev || { echo "❌ npm install failed"; exit 1; }
    fi

    nohup node server.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 1

    PID=$(cat "$PID_FILE" 2>/dev/null)
    if kill -0 "$PID" 2>/dev/null; then
      PORT=$(get_port)
      echo "✅ FileShare started (PID: $PID)"
      sleep 1
      curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" "http://localhost:$PORT/" 2>/dev/null || echo "   (等待服务就绪...)"
    else
      echo "❌ Failed to start FileShare"
      tail -5 "$LOG_FILE" 2>/dev/null
      exit 1
    fi
    ;;
  stop)
    echo "Stopping FileShare..."
    if [ -f "$PID_FILE" ]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null && echo "✅ Stopped (PID: $(cat "$PID_FILE"))"
      rm -f "$PID_FILE"
    fi
    # Fallback: kill any remaining server process
    PIDS=$(pgrep -f "node.*server\\.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      kill $PIDS 2>/dev/null
      echo "✅ Cleaned up remaining processes"
    fi
    echo "Stopped"
    ;;
  restart)
    $0 stop
    sleep 1
    $0 start
    ;;
  status)
    if pgrep -f "node.*server\\.js" >/dev/null 2>&1; then
      PORT=$(get_port)
      echo "📁 FileShare is RUNNING"
      curl -s -o /dev/null -w "   HTTP: %{http_code}\n" "http://localhost:$PORT/" 2>/dev/null || echo "   (HTTP 不可达)"
      echo "   PID: $(pgrep -f 'node.*server\\.js' | tr '\n' ' ')"
    else
      echo "📁 FileShare is STOPPED"
    fi
    ;;
  log)
    if [ -f "$LOG_FILE" ]; then
      tail -f "$LOG_FILE"
    else
      echo "日志文件不存在: $LOG_FILE"
      echo "请先启动服务: bash run.sh start"
    fi
    ;;
  *)
    echo "FileShare 管理脚本"
    echo "用法: $0 {start|stop|restart|status|log}"
    echo ""
    echo "首次使用请先运行: bash install.sh"
    ;;
esac
