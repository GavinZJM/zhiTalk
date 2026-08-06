# zjmtalk

终端里的 ReAct Agent：对话、读写文件、执行命令、渐进式加载 Skills，并支持 MCP、Hooks 与本地记忆。

文档站点：[https://zhitalk.chat](https://zhitalk.chat)

## 功能概览

- **OpenAI 兼容模型**：通过 `baseURL` + `apiKey` 接入 Kimi、OpenAI、DeepSeek 等
- **内置工具**：读/写文件、`exec`、`run_js` / `run_py`、网页抓取；可选 Tavily 搜索
- **Skills**：内置 + 用户目录，按需 `load_skill`；同名技能后者覆盖前者
- **MCP**：在配置里声明本地 / 远程 server，工具名形如 `mcp_<server>_<tool>`
- **Hooks**：在工具调用前后、会话起止等节点跑脚本（拦截 / 注入 / 放行）
- **会话与记忆**：SQLite 保存线程与长期记忆；支持 `/sessions`、`/rewind`、`/compact`
- **子 Agent**：`agent_tool` 可拉起单层子任务（不可嵌套）

## 环境要求

- **Node.js 24**（推荐；仓库含 `.nvmrc`）。原生模块 `better-sqlite3` 需与 Node ABI 一致
- 包管理：开发用 **pnpm 10+**；终端用户用 npm 全局安装即可

## 安装与启动

```bash
npm i -g zjmtalk
zjmtalk
```

本地开发：

```bash
git clone https://github.com/GavinZJM/zhiTalk.git
cd zhiTalk
nvm use          # 或手动切换到 Node 24
pnpm install
pnpm build
pnpm exec zjmtalk
# 或：pnpm dev
```

## 最小配置（必做）

首次启动前创建用户配置：

```bash
mkdir -p ~/.zjmTalk
```

写入 `~/.zjmTalk/zjmTalk.json`（**仅此一段即可对话**；勿提交真实 Key）：

```json
{
  "model": {
    "model": "kimi-k2.6",
    "apiKey": "sk-xxx",
    "baseURL": "https://api.moonshot.cn/v1"
  }
}
```

| 字段 | 说明 |
|------|------|
| `model.model` | 模型 ID，需与服务商控制台一致 |
| `model.apiKey` | API Key |
| `model.baseURL` | OpenAI 兼容根地址，一般以 `/v1` 结尾 |

也可用环境变量覆盖路径：

| 变量 | 作用 |
|------|------|
| `ZJMTALK_CONFIG` | 配置文件路径（默认 `~/.zjmTalk/zjmTalk.json`） |
| `ZJMTALK_DATA_DIR` | 数据目录（默认 `~/.zjmTalk/.data`） |
| `ZJMTALK_MCP_CONFIG` | 独立 MCP JSON（可选） |
| `ZJMTALK_THREAD_ID` | 指定会话线程（高级） |

启动后终端会打印配置手册与快捷键说明。

## CLI 快捷操作

| 输入 | 作用 |
|------|------|
| `ESC` | 取消当前 AI 请求 |
| `/new` | 开启新会话 |
| `/sessions` | 列出最近会话 |
| `/rewind <thread_id>` | 恢复指定会话 |
| `/compact` | 手动压缩当前 Context |
| `exit` | 退出 |

## 目录布局

```
~/.zjmTalk/
├── zjmTalk.json          # 主配置（model / env / mcpServers / hooks）
├── .data/                # SQLite：checkpointer、memory 等
├── .agents/skills/       # 用户 Skills（优先级中）
└── skills/               # 用户 Skills（优先级最高）
```

Skills 扫描顺序（低 → 高，后者覆盖前者）：

1. 包内 `bundled-skills`（随 npm 分发）
2. `~/.zjmTalk/.agents/skills`
3. `~/.zjmTalk/skills`

目录不存在则跳过。修改用户 Skills 后需**重启 CLI**。

## 可选配置

### `env`

配置文件中的字符串键值，供工具读取（例如启用搜索）：

```json
{
  "model": { "...": "..." },
  "env": {
    "TAVILY_API_KEY": "tvly-xxx"
  }
}
```

未配置 `TAVILY_API_KEY` 时，`web_search` 不可用。

### `mcpServers`

本地进程或远程 HTTP 二选一；字符串支持 `${ENV_VAR}` 占位（读进程环境变量）。

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

单个 server 失败不影响其它。也可用 `ZJMTALK_MCP_CONFIG` 指向独立 MCP 配置文件。

### `hooks`

在生命周期节点执行命令。常见事件：`PreToolUse` / `PostToolUse` / `SessionStart` / `SessionEnd` / `UserPromptSubmit`。

- `matcher`：JS RegExp；空或 `*` 表示全部工具（Pre/Post）
- `command`：必填；`timeout` 秒数可选（默认 30）
- 退出码：`0` 继续 · `1` 拦截 · `2` 将 stderr 注入上下文后继续

仓库内提供示例脚本（如 `src/agent/hooks/protect_env.sh`），可按需复制到本机路径并在配置中引用。

### 完整示例（可选字段）

```json
{
  "model": {
    "model": "kimi-k2.6",
    "apiKey": "sk-xxx",
    "baseURL": "https://api.moonshot.cn/v1"
  },
  "env": {
    "TAVILY_API_KEY": "tvly-xxx"
  },
  "version": 1,
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "exec|run_.*",
        "command": "/path/to/protect_env.sh",
        "timeout": 10
      }
    ]
  }
}
```

JSON **不能**写 `//` 注释。

## 内置工具（摘要）

| 工具 | 说明 |
|------|------|
| `read_file` / `write_file` | 读写作区文件（含危险路径校验） |
| `exec` | 执行 shell 命令 |
| `run_js` / `run_py` | 用本机 Node / Python 跑短脚本 |
| `web_fetch` | 抓取 URL |
| `web_search` | Tavily 搜索（需 Key） |
| `load_skill` | 加载指定 Skill 全文 |
| `memory_*` | 创建 / 检索 / 删除长期记忆 |
| `profile_update` | 更新用户 profile |
| `agent_tool` | 单层子 Agent |
| `list_mcp_resources` / `read_mcp_resource` | MCP 资源 |
| `mcp_*` | 各 MCP server 暴露的工具（动态） |

## 内置 Skills

随包装发在 `bundled-skills/`：

| 名称 | 用途 |
|------|------|
| `planner` | 任务拆解与规划 |
| `pdf` | PDF / 表单相关流程与脚本 |
| `playwright-cli` | 浏览器自动化（Playwright CLI） |
| `programer-resume` | 简历相关辅助 |
| `skill-creator` | 编写与评估新 Skill |

自定义 Skill 目录结构示例：

```
~/.zjmTalk/skills/my-skill/
└── SKILL.md
```

`SKILL.md` 需含 frontmatter：

```markdown
---
name: my-skill
description: 一句话说明何时使用
---

# 正文
load_skill 时会加载整份内容。
```

## 开发

```bash
pnpm install          # 安装依赖（会编译 better-sqlite3）
pnpm test             # Jest
pnpm test:watch
pnpm test:coverage
pnpm build            # tsc + 复制 bundled-skills → dist/
pnpm dev              # ts-node 跑 CLI
```

切换 Node 版本后若出现 `NODE_MODULE_VERSION` / bindings 错误：

```bash
nvm use 24
pnpm rebuild better-sqlite3
# 或重新 pnpm install
```

### 项目结构（简）

```
src/agent/
├── cli.ts              # CLI 入口（bin: zjmtalk）
├── agent.ts            # 运行时与流式对话
├── config.ts           # 配置、路径、手册文案
├── db.ts               # 应用库 / memory
├── graph/              # LangGraph 应用与状态
├── tools/              # 内置工具
├── skills/             # Skills 发现与加载
├── hooks/              # Hooks 加载与执行
├── mcp/                # MCP 客户端
├── commands/           # /new /sessions 等
├── sessions/           # 会话列表与 rewind
└── ui/                 # 启动 banner
bundled-skills/         # 随包分发的 Skills
.github/workflows/      # 合并到 master 时测试并 publish 到 npm
```

## 发布说明

- npm 包名：`zjmtalk`，命令：`zjmtalk`
- GitHub Actions：`master` 推送后执行 install → test → build → `npm publish`
- 每次发布前请 bump `package.json` 的 `version`（不可覆盖已发布版本）
- `bin` 路径不要写 `./` 前缀（npm 11 会剔除）

## 常见问题

**配置文件找不到 / JSON 无效**  
按「最小配置」创建 `~/.zjmTalk/zjmTalk.json`，用编辑器校验 JSON。

**能启动但首轮对话报错**  
检查 `apiKey`、`baseURL`、`model` 是否与服务商一致。

**`better-sqlite3` 版本不匹配**  
确认当前是 Node 24，并 `pnpm rebuild better-sqlite3`。

**全局安装后没有 `zjmtalk` 命令**  
确认安装的是 ≥ `1.0.1`（早期 `1.0.0` 曾因 npm 11 bin 校验问题丢掉 CLI 入口）。

**web_search 不可用**  
在配置的 `env.TAVILY_API_KEY` 中填写 Tavily Key。

## License

ISC
