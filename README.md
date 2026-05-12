<div align="center">

# 📁 FileShare

**轻量级文件分享系统**

支持文件夹分享、提取码保护、SVG验证码、在线预览、管理后台

[![Node](https://img.shields.io/badge/Node.js-≥16-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/cjm2004/FileShare/pulls)

---

</div>

## 一、✨ 功能特性

| 类别 | 特性 |
|------|------|
| 📂 **文件夹分享** | 后台文件树浏览，勾选文件夹/文件一键生成分享链接 |
| 🔑 **提取码保护** | 可选提取码，访问时需要验证 |
| ⏰ **过期策略** | 精确到秒的过期时间 + 最大访问次数上限，超时自动失效 |
| 🛡️ **SVG 验证码** | 服务器端生成，算术/字符两种模式，提取/下载可分别控制 |
| 🖼️ **在线预览** | 图片 / 视频 / 音频 / 文本 / Markdown / 代码内联预览 |
| 📦 **智能下载** | 单文件直接下载，多文件/文件夹自动流式 ZIP 打包 |
| 🎨 **毛玻璃 UI** | 蓝色渐变主题，磨砂玻璃效果卡片，可收起侧栏 |
| 🔐 **JWT 认证** | Token 认证 + bcrypt 密码哈希，安全可靠 |
| 🔤 **编码自适应** | 自动检测 UTF-8/GBK 编码，中文文本不乱码 |
| 🔗 **域名绑定** | 自定义域名生成分享链接 |
| 📎 **KKFileView 对接** | 可选集成，实现 Office 文档在线预览 |
| 🔄 **日志轮转** | 自动保持最近日志，方便排查 |
| 📱 **响应式布局** | 桌面端/手机端自适应，侧栏滑入遮罩，超宽内容横向滚动 |
| 🚀 **一键安装** | 环境检测 + 端口配置 + 依赖安装 + 启动引导 |

## 二、🖼️ 页面预览

| 页面 | 说明 |
|------|------|
| **首页** | 提取文件入口 + SVG 验证码 |
| **管理后台** | 文件浏览、创建分享、分享管理、系统设置 |
| **分享页** | 树形文件浏览、在线预览、下载、提取码验证 |
<img width="216" height="480" alt="Screenshot_2026-05-12-11-13-16-384_mark via-edit" src="https://github.com/user-attachments/assets/a04d35d8-bef3-4910-97c3-f30c9715b373" />
<img width="216" height="480" alt="Screenshot_2026-05-12-11-13-48-178_mark via" src="https://github.com/user-attachments/assets/40c635d7-ca26-4aed-b7f4-b5968e9a438a" />
<img width="216" height="480" alt="Screenshot_2026-05-12-11-13-55-660_mark via" src="https://github.com/user-attachments/assets/eac93f2b-4258-400d-aab6-a87c46da9542" />
<img width="216" height="480" alt="Screenshot_2026-05-12-11-14-03-845_mark via-edit" src="https://github.com/user-attachments/assets/544159b7-aaf4-4d3e-8696-50da9956c5c5" />
<img width="216" height="480" alt="Screenshot_2026-05-12-11-14-17-500_mark via-edit" src="https://github.com/user-attachments/assets/0f6da7d3-0b20-4d60-ab18-100831783b65" />


## 三、📦 快速开始

### 3.1 环境要求

- **Node.js** ≥ 16.x（推荐 18+）
- **npm**（随 Node.js 安装）

```bash
node -v   # 应显示 v16.x.x 或更高
npm -v    # 应显示 8.x.x 或更高
```

### 3.2 一键安装

- 解压
```bash
unzip FileShare.zip -d /opt
```
```bash
cd /opt/FileShare
```
- 安装（引导式：检测环境 → 设置端口 → 安装依赖 → 启动）
```bash
sudo chmod +x install.sh
```
```bash
bash install.sh #或./install.sh
```

安装过程交互引导：
1. ✅ 检测 Node.js/npm/curl 等工具，缺失时询问是否自动安装
2. 🔌 设置 HTTP 服务端口
3. 📦 自动安装 npm 依赖
4. 🚀 可选立即启动服务

### 3.3 手动启动

```bash
bash run.sh start        # 启动
bash run.sh stop         # 停止
bash run.sh restart      # 重启
bash run.sh status       # 查看状态
bash run.sh log          # 查看日志
```

### 3.4 访问地址

| 页面 | 地址 | 用途 |
|------|------|------|
| 🏠 首页 | `http://你的IP:端口` | 提取文件入口 |
| 🔧 管理后台 | `http://你的IP:端口/admin` | 管理分享、系统设置 |
| 🔗 分享页 | `http://你的IP:端口/s/{分享码}` | 分享展示 |

**默认管理员：** `admin` / `admin123`

> ⚠️ 首次登录会强制要求修改密码。

## 四、🧭 管理后台使用指南

### 4.0 初始设置
1. 使用初始密码登录，重置密码
2. 去后台-账户安全-修改用户名
3. 去系统设置-设置分享域名-设置内容设置和文件扫描路径
4. 去预览设置-设置预览模式
5.  去创建分享-选取文件，设置分享配置，分享测试

### 4.1 创建分享

1. 左侧导航 → 「创建分享」
2. 浏览文件树，勾选需要分享的文件或文件夹
3. 可选设置：提取码、过期时间、最大访问次数
4. 点击「创建分享」生成链接

### 4.2 验证码设置

「系统设置」→ 验证码设置卡片：

- **总开关**：关闭后所有验证码不生效，子选项自动隐藏
- **类型**：算术验证码 / 字符验证码
- **提取前验证**：首页提取文件时验证
- **下载前验证**：分享页下载文件时验证

### 4.3 预览设置

「预览设置」页面：

1. **预览模式**：系统预览 / 自定义预览（KKFileView）
2. **可预览后缀**：逗号分隔自定义
3. **KKFileView 地址**：Office 文档在线预览需配置

### 4.4 分享管理

「分享记录」页面：查看/编辑/删除/搜索分享，一键清理失效分享。

### 4.5 响应式操作

- **桌面端**：侧栏 ☰ 可收起为仅图标模式（60px）
- **手机端**：左上角 ☰ 滑入侧栏，点击遮罩关闭

## 五、🔧 配置

### 5.1 修改端口

```bash
# 方式一：重跑安装脚本
bash install.sh

# 方式二：手动修改
bash run.sh stop
sed -i 's/const PORT = [0-9]*/const PORT = 8080/' server.js
bash run.sh start
```

### 5.2 反向代理 + 域名绑定（推荐使用lucky）

```nginx
server {
    listen 80;
    server_name share.example.com;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:6606;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置后，管理后台 → 分享设置 → 域名绑定填入 `share.example.com`。

### 5.3 备份

```bash
cp data/fileshare.db data/fileshare.db.bak   # 备份
cp data/fileshare.db.bak data/fileshare.db   # 恢复
bash run.sh restart                           # 重启
```

### 5.4 开机自启

```bash
(crontab -l 2>/dev/null; echo '*/5 * * * * curl -s -m 5 http://127.0.0.1:6606/api/ping -o /dev/null -w "%{http_code}" | grep -q "200" || /opt/FileShare/run.sh start >/dev/null 2>&1'; echo '@reboot sleep 10 && /opt/FileShare/run.sh start >/dev/null 2>&1') | crontab -
```

### 5.5 卸载

```bash
cd /opt/FileShare
bash uninstall.sh        # 停止服务 + 清理 crontab
rm -rf /opt/FileShare    # 完全删除
```

> 💡 如需保留数据，先备份 `data/fileshare.db`。

## 六、🗂️ 支持预览的文件类型

| 类型 | 格式 |
|------|------|
| **图片** | jpg, jpeg, png, gif, bmp, webp, svg, ico, tiff, avif, heic |
| **视频** | mp4, webm, ogg, mov, avi, mkv, flv, wmv, 3gp |
| **音频** | mp3, wav, aac, flac, m4a, wma |
| **文本/代码** | txt, md, log, json, xml, yaml, csv, js, ts, py, java, go, rs, php 等 70+ 种 |

> 📝 **编码自适应**：自动检测 UTF-8/GBK 编码，中文 TXT 不乱码。

## 七、🛠️ 技术栈

| 层 | 技术 |
|----|------|
| **后端** | Node.js + Express |
| **数据库** | SQLite (better-sqlite3) |
| **前端** | 原生 HTML/CSS/JS（零框架依赖） |
| **认证** | JWT + bcrypt |
| **验证码** | svg-captcha（SVG 生成，算术/字符模式） |
| **打包** | archiver（流式 ZIP） |
| **编码检测** | iconv-lite |
| **部署** | 单机单进程，crontab 保活 |

## 八、📄 目录结构

```
FileShare/
├── server.js             # 主程序
├── package.json          # 依赖配置
├── install.sh            # 安装脚本
├── run.sh                # 管理脚本
├── uninstall.sh          # 卸载脚本
├── .gitignore
├── public/
│   ├── index.html        # 首页（提取文件）
│   ├── admin.html        # 管理后台
│   └── share.html        # 分享页
├── data/                 # 运行时数据
├── logs/                 # 运行日志
└── uploads/              # 上传文件
```

## 九、📜 License

[MIT](LICENSE)

---

<div align="center">

**FileShare** · Made with ❤️ and 100% ai😂😂😂

[GitHub](https://github.com/cjm2004/FileShare) · [Issues](https://github.com/cjm2004/FileShare/issues) · [PRs](https://github.com/cjm2004/FileShare/pulls)

</div>
