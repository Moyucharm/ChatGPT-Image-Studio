# ChatGpt Image Studio

ChatGpt Image Studio 是一个单服务交付的图片工作流项目：

- `backend/`：Go 后端，负责图片接口、账号池、配置管理和静态资源托管
- `web/`：Vite + React 前端，构建后输出到 `web/dist`
- `scripts/`：本地开发、检查、构建脚本

项目当前交付方式是“一个二进制 + 一份静态前端 + 本地配置目录”：

- 前端不需要单独部署
- 后端运行时直接托管 `static/`
- 首次启动时自动生成 `data/config.toml`
- 首次生成配置后即可本地运行

## 核心功能

- 基于 `gpt-image-2` 的文本生图
- 参考图生成与连续编辑
- 选区涂抹式局部重绘
- 图片放大与增强
- 兼容图片场景的 `/v1/chat/completions` 与 `/v1/responses`
- 本地认证文件导入与账号池管理
- 额度查询与刷新
- 与 CLIProxyAPI 兼容的 CPA 双向同步
- 请求方向记录页，可区分官方与 CPA 链路
- 配置管理页，可直接修改 `data/config.toml`

## 界面预览

| 预览 1 | 预览 2 |
| --- | --- |
| ![界面预览 1](asset/21994c2f6f7ccdc2f5c6f5c472c1e7a7af4f1063.png) | ![界面预览 2](asset/665a23c2fc38a6c49d127f454b651854fcfa8e84.png) |
| ![界面预览 3](asset/9c47ac91270469513b769c30748f6d48f421ba9f.png) | ![界面预览 4](asset/a4f2e51c873e3066fb71fcab84fee8dee8ff9ea9.png) |
| ![界面预览 5](asset/bb2f570badfb194f8b16b07221df40bfac94ee05.png) | ![界面预览 6](asset/bf84c0b8a48d8cc28afec8a1980834887f8dd211.png) |

## 仓库结构

```text
.
├── backend/                  Go 后端
│   ├── api/                  HTTP 路由与处理器
│   ├── internal/             配置、账号、同步、中间件、版本信息
│   ├── data/                 默认模板与本地运行数据目录
│   ├── static/               本地开发时同步的前端静态资源（构建产物，不入库）
│   └── main.go
├── web/                      Vite 前端
│   ├── src/                  React 页面与组件
│   └── dist/                 构建产物（不入库）
├── scripts/                  build / dev / check 脚本
└── README.md
```

## 环境要求

- Go `1.25+`
- Node.js `24+`
- npm `10+`

## 获取项目

```bash
git clone https://github.com/peiyizhi0724/ChatGpt-Image-Studio.git
cd ChatGpt-Image-Studio
```

## 本地开发

### 启动开发环境

Windows：

```powershell
./scripts/dev.ps1
```

macOS / Linux：

```bash
chmod +x ./scripts/*.sh
./scripts/dev.sh
```

开发脚本会自动完成：

1. 安装前端依赖
2. 构建 `web/dist`
3. 同步前端资源到 `backend/static`
4. 启动 Go 后端

默认地址：

- `http://127.0.0.1:7000`

健康检查：

- `GET /health`

## Docker 部署

当前仓库支持通过 GitHub Container Registry 直接拉取镜像部署。

镜像发布规则：

- 推送到默认分支后，GitHub Actions 会自动更新 `ghcr.io/<当前仓库 owner>/chatgpt-image-studio:latest`
- 推送版本标签 `v1.2.x` 后，会额外发布同名版本镜像标签
- Docker 镜像同时提供 `linux/amd64` 与 `linux/arm64`
- fork 仓库会发布到自己的 GHCR 命名空间，例如 `ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio:latest`

### 首次启动

```bash
docker compose pull
docker compose up -d
```

默认会：

- 使用 `ghcr.io/peiyizhi0724/chatgpt-image-studio:latest`，也就是默认上游仓库当前最新镜像
- 将宿主机的 `./backend/data` 挂载到容器内 `/app/data`
- 对外暴露 `7000` 端口

如果你要部署自己 fork 仓库发布的镜像，可先设置：

```bash
export IMAGE_NAME=ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio
docker compose pull
docker compose up -d
```

Windows PowerShell：

```powershell
$env:IMAGE_NAME = "ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio"
docker compose pull
docker compose up -d
```

如果你希望 `docker compose pull` 和一键更新脚本持续使用同一个 fork 镜像，建议在仓库根目录创建 `.env`：

```dotenv
IMAGE_NAME=ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio
IMAGE_TAG=latest
```

如需固定到某个版本，可先设置：

```bash
export IMAGE_NAME=ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio  # 部署上游镜像时可省略
export IMAGE_TAG=v1.2.7
docker compose pull
docker compose up -d
```

Windows PowerShell：

```powershell
$env:IMAGE_NAME = "ghcr.io/<你的 GitHub 用户名>/chatgpt-image-studio" # 部署上游镜像时可省略
$env:IMAGE_TAG = "v1.2.7"
docker compose pull
docker compose up -d
```

### 一键更新

Windows：

```powershell
./scripts/docker-update.ps1
```

macOS / Linux：

```bash
chmod +x ./scripts/docker-update.sh
./scripts/docker-update.sh
```

更新脚本会自动执行：

1. 检查 Docker / Docker Compose
2. 如果当前目录是 Git 仓库，则先 `git pull --ff-only origin main`
3. 从 GitHub Container Registry 拉取 `IMAGE_NAME:IMAGE_TAG` 对应镜像（默认是上游 `latest`）
4. 重新创建并启动容器

### 配置文件

程序启动时会确保以下文件存在：

- `data/config.example.toml`
- `data/config.toml`

在仓库开发模式下，上述路径实际对应：

- `backend/data/config.example.toml`
- `backend/data/config.toml`

如果 `config.toml` 不存在，程序会自动按内置模板生成，无需手动复制。

最小配置示例：

```toml
[app]
auth_key = "chatgpt2api"
```

如果需要接入 CPA 同步：

```toml
[sync]
enabled = true
base_url = "http://127.0.0.1:8317"
management_key = "your-cliproxy-management-key"
provider_type = "codex"
```

如果需要通过固定代理访问 ChatGPT，可追加：

```toml
[proxy]
enabled = true
url = "socks5h://127.0.0.1:10808"
mode = "fixed"
sync_enabled = false
```

如果需要调整 `Free` / `Plus / Pro / Team` 账号的图片链路，可在 `[chatgpt]` 下补充：

```toml
[chatgpt]
free_image_route = "legacy"
free_image_model = "auto"
paid_image_route = "responses"
paid_image_model = "gpt-5.4-mini"
```

说明：

- `free_image_route`
  控制 `Free` 账号图片请求走哪条链路。
- `free_image_model`
  控制 `Free` 账号真正发给上游的模型名。
- `paid_image_route`
  控制 `Plus / Pro / Team` 账号图片请求走哪条链路。
- `paid_image_model`
  控制 `Plus / Pro / Team` 账号真正发给上游的模型名。

## 构建

Windows：

```powershell
./scripts/build.ps1
```

macOS / Linux：

```bash
./scripts/build.sh
```

构建脚本会执行：

1. 构建前端 `web/dist`
2. 同步前端资源到 `backend/static`
3. 构建后端二进制
4. 生成本地发布目录 `dist/package`

构建输出目录结构：

```text
dist/package/
├── chatgpt-image-studio.exe / chatgpt-image-studio
├── data/
│   └── config.example.toml
├── static/
│   ├── index.html
│   └── assets/...
└── README.txt
```

## 检查

Windows：

```powershell
./scripts/check.ps1
```

macOS / Linux：

```bash
./scripts/check.sh
```

当前检查项：

- `go test ./...`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

如需额外验证 `Studio / CPA` 以及旧版 `mix -> studio` 兼容迁移的图片路由，可打开可选黑盒测试：

macOS / Linux：

```bash
RUN_IMAGE_MODE_COMPAT_TESTS=1 ./scripts/check.sh
```

Windows PowerShell：

```powershell
$env:RUN_IMAGE_MODE_COMPAT_TESTS = "1"
./scripts/check.ps1
```

这组测试默认不会在普通检查里执行，只在显式设置环境变量后追加运行：

- `go test ./api -run TestImageModeCompatibilityBlackBox -count=1`

## 启动失败兜底

如果启动失败，程序会：

- 在命令行输出中文错误信息
- 将详细信息写入 `data/last-startup-error.txt`

当前重点处理的失败场景：

- 端口占用
- 配置文件损坏
- 静态资源缺失
- 首次生成配置文件失败

## 主要接口

### 应用基础

- `POST /auth/login`
- `GET /version`
- `GET /health`

### 账号管理

- `GET /api/accounts`
- `POST /api/accounts`
- `POST /api/accounts/import`
- `DELETE /api/accounts`
- `POST /api/accounts/refresh`
- `POST /api/accounts/update`
- `GET /api/accounts/{id}/quota`

### 配置与请求记录

- `GET /api/config`
- `PUT /api/config`
- `GET /api/requests`

### 同步

- `GET /api/sync/status`
- `POST /api/sync/run`

### 图片接口

- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/images/upscale`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /v1/files/image/{filename}`

## 本地数据与敏感信息

以下内容默认不会提交到 Git：

- `backend/data/config.toml`
- `backend/data/config.example.toml`
- `backend/data/accounts_state.json`
- `backend/data/auths/*.json`
- `backend/data/sync_state/*.json`
- `backend/data/tmp/`
- `backend/data/last-startup-error.txt`
- `backend/static/`
- `web/dist/`
- 发布产物、日志、临时文件、本地二进制

不要提交认证文件、管理密钥、运行状态或日志中的敏感内容。

## 社区支持

- Linux.do 社区：<https://linux.do/>

## 许可证

本仓库使用 MIT 许可证，详见 [LICENSE](LICENSE)。

> [!WARNING]
> 免责声明：
>
> 本项目涉及对 ChatGPT 官网相关图片能力的研究与封装，仅供个人学习、技术研究与非商业性技术交流使用。
>
> - 严禁将本项目用于任何商业用途、盈利性使用、批量操作、自动化滥用或规模化调用。
> - 严禁将本项目用于生成、传播或协助生成违法、暴力、色情、未成年人相关内容，或用于诈骗、欺诈、骚扰等非法或不当用途。
> - 严禁将本项目用于任何违反 OpenAI 服务条款、当地法律法规或平台规则的行为。
> - 使用者应自行承担全部风险，包括但不限于账号被限制、临时封禁、永久封禁以及因违规使用等导致的法律责任。
> - 使用本项目即视为你已充分理解并同意本免责声明全部内容；如因滥用、违规或违法使用造成任何后果，均由使用者自行承担。

> [!IMPORTANT]
> 本项目基于对 ChatGPT 官网相关能力的研究实现，存在账号受限、临时封禁或永久封禁的风险。请勿使用自己的重要账号、常用账号或高价值账号进行测试。
