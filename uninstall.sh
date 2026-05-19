# FileShare 卸除脚本
# 用法: bash uninstall.sh
# 如需保留数据，先备份 data/fileshare.db

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="FileShare"

echo ""
echo "  ─────────────────────────────────────────"
echo "    $APP_NAME 卸载"
echo "  ─────────────────────────────────────────"
echo ""

echo "  🧹 正在停止服务..."
cd "$APP_DIR"
bash run.sh stop 2>/dev/null
echo ""

# ── 清理 systemd 服务 ──
if [ -f /etc/systemd/system/fileshare.service ]; then
  echo "  🗑️  停止并移除 systemd 服务..."
  sudo systemctl stop fileshare 2>/dev/null
  sudo systemctl disable fileshare 2>/dev/null
  sudo rm -f /etc/systemd/system/fileshare.service
  sudo systemctl daemon-reload 2>/dev/null
  echo "  ✓ systemd 服务已移除"
else
  echo "  ℹ️  systemd 服务不存在，跳过"
fi
echo ""

echo "  🗑️  清理 crontab 自启条目..."
crontab -l 2>/dev/null | grep -v "$APP_DIR" | grep -v "fileshare" | crontab - 2>/dev/null
echo "  ✓ crontab 已清理"
echo ""

echo "  🗑️  清理 PID 文件..."
rm -f /tmp/fileshare.pid 2>/dev/null
echo "  ✓ 已完成"
echo ""

echo "  💡 如需撤销之前设置的可访问路径权限，可手动执行:"
echo "     sudo chown -R 原用户:原组 /path/to/dir"
echo ""

echo "  ─────────────────────────────────────────"
echo "  ✅ $APP_NAME 已停止并移除自启配置。"
echo ""
echo "  如需完全删除所有数据（含数据库），执行:"
echo "    rm -rf \"$APP_DIR\""
echo ""
echo "  如需保留数据，请先备份:"
echo "    cp \"$APP_DIR/data/fileshare.db\" /path/to/backup/"
echo ""
echo "  重新启动只需再次运行:"
echo "    cd \"$APP_DIR\" && bash run.sh start"
echo "  ─────────────────────────────────────────"
echo ""
