set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ═══════════════════════════════════════════════
#  ASCII Banner
# ═══════════════════════════════════════════════

clear
echo ""
echo "   ███████╗██╗██╗     ███████╗███████╗██╗  ██╗ █████╗ ██████╗ ███████╗"
echo "   ██╔════╝██║██║     ██╔════╝██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝"
echo "   █████╗  ██║██║     █████╗  ███████╗███████║███████║██████╔╝█████╗  "
echo "   ██╔══╝  ██║██║     ██╔══╝  ╚════██║██╔══██║██╔══██║██╔══██╗██╔══╝  "
echo "   ██║     ██║███████╗███████╗███████║██║  ██║██║  ██║██║  ██║███████╗"
echo "   ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝"
echo ""
echo "  🔗  https://github.com/cjm2004/FileShare"
echo "  ──────────────────────────────────────────"
echo "  轻量级文件分享系统 · 一键安装"
echo ""
echo ""

# ═══════════════════════════════════════════════
#  Helper functions
# ═══════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${CYAN}→${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1"; }

prompt() {
  local msg="$1"
  local default="$2"
  local val
  read -p "$(echo -e "  ${CYAN}?${NC} ${msg} [${default}]: ")" val
  echo "${val:-$default}"
}

confirm() {
  local msg="$1"
  local default="${2:-N}"
  local ans
  local hint
  if [ "$default" = "Y" ]; then hint="Y/n"; else hint="y/N"; fi
  read -p "$(echo -e "  ${CYAN}?${NC} ${msg} (${hint}): ")" ans
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[Yy] ]]
}

separator() {
  echo "  ─────────────────────────────────────────"
}

# Detect package manager
detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then echo "apt"
  elif command -v dnf &>/dev/null; then echo "dnf"
  elif command -v yum &>/dev/null; then echo "yum"
  elif command -v apk &>/dev/null; then echo "apk"
  elif command -v pacman &>/dev/null; then echo "pacman"
  elif command -v brew &>/dev/null; then echo "brew"
  else echo ""; fi
}

install_pkg() {
  local pkg="$1"
  local pm=$(detect_pkg_manager)
  echo ""
  info "安装 ${pkg}..."
  case "$pm" in
    apt) sudo apt update -qq 2>/dev/null && sudo apt install -y "$pkg" 2>/dev/null || return 1 ;;
    dnf|yum) sudo "$pm" install -y "$pkg" 2>/dev/null || return 1 ;;
    apk) apk add "$pkg" 2>/dev/null || return 1 ;;
    pacman) sudo pacman -S --noconfirm "$pkg" 2>/dev/null || return 1 ;;
    brew) brew install "$pkg" 2>/dev/null || return 1 ;;
    *) return 1 ;;
  esac
}

install_nodejs_nodesource() {
  local ver="$1"  # e.g. "18"
  local pm=$(detect_pkg_manager)
  echo ""
  info "通过 NodeSource 安装 Node.js ${ver}.x..."

  case "$pm" in
    apt)
      if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "armv7l" ]; then
        wget -qO- "https://deb.nodesource.com/setup_${ver}.x" | sudo -E bash - 2>/dev/null || return 1
      else
        curl -fsSL "https://deb.nodesource.com/setup_${ver}.x" | sudo -E bash - 2>/dev/null || return 1
      fi
      sudo apt-get install -y nodejs 2>/dev/null || return 1
      ;;
    dnf|yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${ver}.x" | sudo -E bash - 2>/dev/null || return 1
      sudo "$pm" install -y nodejs 2>/dev/null || return 1
      ;;
    *)
      # Fallback: nvm
      info "尝试使用 nvm 安装..."
      local nvm_tool="curl"
      command -v curl &>/dev/null || nvm_tool="wget"
      if [ "$nvm_tool" = "curl" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>/dev/null || return 1
      else
        wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>/dev/null || return 1
      fi
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      if command -v nvm &>/dev/null; then
        nvm install "$ver" 2>/dev/null && nvm use "$ver" 2>/dev/null && nvm alias default "$ver" 2>/dev/null || return 1
      else
        return 1
      fi
      ;;
  esac
  return 0
}

# ═══════════════════════════════════════════════
#  1. 环境检测
# ═══════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${CYAN}${BOLD}步骤 1/4 · 环境检测${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"
info "系统: ${OS} ${ARCH}"
echo ""

# -- Node.js --
HAS_NODE=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 16 ]; then
    ok "Node.js ${NODE_VER}"
    HAS_NODE=true
  else
    warn "Node.js ${NODE_VER}（需要 ≥16）"
  fi
else
  warn "Node.js 未安装"
fi

if [ "$HAS_NODE" = false ]; then
  echo ""
  if confirm "Node.js 缺失或版本过低，是否自动安装 Node.js 18.x？" Y; then
    install_nodejs_nodesource 18 && ok "Node.js 安装完成" || {
      err "自动安装失败"
      echo "  可手动安装: https://nodejs.org/"
      echo "  或执行: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
      exit 1
    }
  else
    err "请安装 Node.js ≥16 后重试"
    exit 1
  fi
fi
echo ""

# -- npm --
if command -v npm &>/dev/null; then
  ok "npm $(npm -v)"
else
  warn "npm 未安装"
  echo ""
  if confirm "npm 未找到（通常随 Node.js 自带），是否尝试修复？" Y; then
    if command -v nvm &>/dev/null; then
      nvm install 18 --reinstall-packages-from=default 2>/dev/null && ok "npm 已就绪" || warn "请检查 Node.js 安装"
    else
      # Reinstall Node.js (npm comes bundled)
      install_nodejs_nodesource 18 && ok "npm 已就绪" || warn "请手动安装"
    fi
  fi
fi
echo ""

# -- Optional tools --
TOOLS_MISSING=()
for tool in curl procps unzip wget; do
  if command -v "$tool" &>/dev/null; then
    ok "$tool 已就绪"
  else
    warn "$tool 未安装"
    TOOLS_MISSING+=("$tool")
  fi
done

if [ ${#TOOLS_MISSING[@]} -gt 0 ]; then
  echo ""
  info "以下工具可选安装（推荐）："
  for t in "${TOOLS_MISSING[@]}"; do
    if confirm "安装 ${t}？" Y; then
      if install_pkg "$t"; then
        ok "${t} 安装完成"
      else
        warn "${t} 安装失败，可稍后手动安装"
      fi
    else
      info "跳过 ${t}"
    fi
  done
fi

echo ""

# ═══════════════════════════════════════════════
#  2. 端口配置
# ═══════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${CYAN}${BOLD}步骤 2/4 · 服务端口配置${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DEFAULT_PORT=6606
if ss -tlnp 2>/dev/null | grep -qP ":$DEFAULT_PORT\b" || lsof -i:"$DEFAULT_PORT" &>/dev/null 2>&1; then
  warn "端口 ${DEFAULT_PORT} 已被占用"
  DEFAULT_PORT=""
fi

PORT=$(prompt "请设置 HTTP 服务端口号" "${DEFAULT_PORT:-8080}")

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  err "端口号必须是 1024-65535 之间的数字"
  exit 1
fi

if ss -tlnp 2>/dev/null | grep -qP ":$PORT\b" || lsof -i:"$PORT" &>/dev/null 2>&1; then
  warn "端口 ${PORT} 已被占用"
  if ! confirm "继续使用该端口？"; then
    exit 1
  fi
fi
echo ""

# ═══════════════════════════════════════════════
#  3. 应用配置
# ═══════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${CYAN}${BOLD}步骤 3/4 · 应用配置与依赖安装${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$APP_DIR"

# 设置端口
info "写入端口配置: ${PORT}"
sed -i "s/^const PORT = [0-9]*;/const PORT = ${PORT};/" server.js 2>/dev/null || \
sed -i "s/const PORT = [0-9]*/const PORT = ${PORT}/" server.js
ok "端口已配置"

# 创建目录
mkdir -p data logs
ok "数据目录已就绪"

# 项目依赖
echo ""
info "即将安装项目依赖包（npm install）"
if confirm "是否安装项目依赖？" Y; then
  echo ""
  if npm install --omit=dev 2>&1; then
    echo ""
    ok "依赖安装完成"
  else
    echo ""
    err "依赖安装失败"

[72 more lines in file. Use offset=291 to continue.]
    exit 1
  fi
else
  warn "跳过依赖安装（运行 start 时会自动安装）"
fi
echo ""

# ═══════════════════════════════════════════════
#  4. 共享目录提示
# ═══════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${CYAN}${BOLD}步骤 4/5 · 共享目录${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${YELLOW}💡${NC} FileShare 运行在 ${GREEN}cjm${NC} 用户下"
echo -e "  ${YELLOW}💡${NC} 后台登录后，在「系统设置 → 共享目录」中设置读取路径即可"
echo -e "  ${YELLOW}💡${NC} 如需分享其他用户的文件，确保 cjm 有读取权限即可"

echo ""

# ── 开机自启设置 ──
if confirm "🚀 是否设置开机自启（重启后自动启动 FileShare）？" Y; then
  SERVICE_FILE="/etc/systemd/system/fileshare.service"
  info "创建 systemd 服务..."

  sudo cat > "$SERVICE_FILE" << SERVEOF
[Unit]
Description=FileShare - 轻量级文件分享系统
After=network.target

[Service]
Type=simple
User=$(whoami)
Group=$(id -gn)
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
StandardOutput=append:$APP_DIR/logs/app.log
StandardError=append:$APP_DIR/logs/app.log

[Install]
WantedBy=multi-user.target
SERVEOF

  sudo systemctl daemon-reload 2>/dev/null
  sudo systemctl enable fileshare 2>/dev/null
  sudo systemctl start fileshare 2>/dev/null

  if sudo systemctl is-active --quiet fileshare 2>/dev/null; then
    ok "开机自启已启用，服务运行中"
  else
    warn "systemd 服务创建完成，但启动失败，可手动执行: sudo systemctl start fileshare"
  fi
else
  info "跳过开机自启设置"
fi

echo ""
#  5. 完成
# ═══════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${CYAN}${BOLD}步骤 5/5 · 安装完成${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${GREEN}${BOLD}✅  FileShare 安装成功！${NC}"
echo ""
separator
echo -e "  ${BOLD}安装信息${NC}"
separator
echo ""
echo -e "  ${CYAN}📁${NC}  安装目录:  ${APP_DIR}"
echo -e "  ${CYAN}🔢${NC}  端口:      ${PORT}"
echo -e "  ${CYAN}🔧${NC}  Node.js:   $(node -v 2>/dev/null || echo '?')"
echo -e "  ${CYAN}📦${NC}  npm:       $(npm -v 2>/dev/null || echo '?')"
echo ""
separator
echo -e "  ${BOLD}管理登录${NC}"
separator
echo ""
echo -e "  ${YELLOW}用户名${NC}:   admin"
echo -e "  ${YELLOW}密码${NC}:     admin123"
echo ""
separator
echo -e "  ${BOLD}访问地址${NC}"
separator
echo ""
echo -e "  ${GREEN}首页${NC}:       http://本机IP:${PORT}"
echo -e "  ${GREEN}管理后台${NC}:   http://本机IP:${PORT}/admin"
echo ""
separator
echo -e "  ${BOLD}常用命令${NC}"
separator
echo ""
echo -e "  bash run.sh start    启动服务"
echo -e "  bash run.sh stop     停止服务"
echo -e "  bash run.sh restart  重启服务"
echo -e "  bash run.sh status   查看状态"
echo -e "  bash run.sh log      查看日志"
echo ""
separator
echo ""

if confirm "🚀 立即启动 FileShare 服务？" Y; then
  echo ""
  bash run.sh start || warn "服务启动失败，可稍后手动运行: bash run.sh start"
  echo ""
  echo -e "  ${GREEN}服务已启动！${NC} 浏览器打开:"
  echo -e "    http://本机IP:${PORT}"
  echo ""
  echo -e "  ⚡ 首次使用请登录管理后台，在「系统设置」中设置共享目录"
fi

echo ""
echo -e "  ─────────────────────────────────────────"
echo -e "  ${GREEN}FileShare 安装完毕！${NC}"
echo -e "  ${CYAN}https://github.com/cjm2004/FileShare${NC}"
echo -e "  ─────────────────────────────────────────"
echo ""
