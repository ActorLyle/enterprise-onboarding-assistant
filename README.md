# 企业入职助手：Plan + Skill 可配置执行平台

企业入职助手是一个使用本地 JSON 数据的 MVP。它把新员工常见问题交给 Planner 识别，再按需读取员工、任务、制度、联系人或培训数据，组织回复并进行风险检查。项目提供 Web 管理界面和 HTTP API；没有配置大模型 API 时，也可以用 Mock 模式演示。

## 项目解决什么问题

新员工入职时，经常需要反复确认报到流程、待办任务、制度、培训安排和对接人。本项目把这些演示资料集中在本地 JSON 文件中，并用可配置的 Skill 和 Tool 展示从问题识别、资料查询到回复审核的执行过程。

这是用于验证流程和交互的本地 MVP：不连接真实 HR、OA 或企业知识库，也不提供真实员工身份认证。`data/` 中的资料是演示数据，不能当作公司的正式制度或员工记录。

## 主要功能

- **Agent 执行台**：选择 10 位模拟员工之一，输入问题或使用快捷提问；查看 Planner 计划、每一步 Skill/Tool 的输入和输出、最终回复及风险审核结果。
- **六个可配置 Skill**：问题结构化、任务决策、流程解释、制度问答、沟通回复和合规审核。可编辑提示词、模型参数与启用状态，并单独测试。
- **六个本地 Tool**：查询员工信息、入职任务、公司联系人、制度和培训，以及计算任务进度。查询结果来自 `data/` 中的 JSON 文件。
- **Coze 工作流 Tool**：注册工作流 `7661245829961302052`，输入 `user_id`、`CONVERSATION_NAME` 和 `USER_INPUT`，输出 `answer`、`status`、`risk_level`。可在 Tool 管理页查看配置、启停和测试。Agent 对话本身不会自动调用该 Coze Tool。
- **执行日志**：查看历史请求、执行步骤、证据摘要和审核结果；可以打开详情或删除单条记录。最多保存最近 200 条。
- **大模型可选**：支持兼容 OpenAI Chat Completions 的 API。没有配置密钥或调用失败时，生成步骤回退到 Mock 模式；本地查询仍由 Tool 执行。
- **本地配置持久化**：Skill、Tool 和日志由服务写回相应 JSON 文件。API Token 留在服务端，不返回给浏览器。

## 环境要求

- Node.js 18 或更高版本
- 现代浏览器
- 可选：兼容 OpenAI Chat Completions 的模型 API
- 可选：Coze API Token（仅调用 Coze 工作流时需要）

## 安装与启动

在项目根目录（包含 `package.json` 的目录）运行：

```bash
node --version
npm start
```

本项目没有第三方 npm 依赖，不需要运行 `npm install`。服务默认监听本机 `3000` 端口。启动后打开：

```text
http://localhost:3000/
```

健康检查地址为 `http://localhost:3000/api/health`。打开 localhost 地址不会启动服务；要先运行 `npm start`，或使用下面的 Windows 后台启动方式。

### 开发模式和自定义端口

开发模式使用 Node.js `--watch` 监视服务入口及其导入模块，并在这些文件变化时重启：

```bash
npm run dev
```

PowerShell 中可用其他端口启动，例如：

```powershell
$env:PORT = '5000'
npm start
```

然后打开 `http://localhost:5000/`。端口设置只对该终端会话有效。

### Windows 后台启动（可选）

```powershell
npm run start:background
npm run server:status
```

还提供 `npm run server:restart` 和 `npm run server:stop`。后台服务日志写入 `.runtime/server.log`。如需在 Windows 登录时自动启动本项目的 3000 端口服务，可运行 `npm run autostart:install`；移除快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 -Remove
```

## 使用方法

1. 启动服务并打开 `http://localhost:3000/`。
2. 在 **Agent 执行** 中选择模拟员工，输入入职问题并提交。结果区会显示执行计划、步骤详情、回复和风险审核。
3. 在 **Skill 管理** 中选择 Skill，编辑描述、提示词、模型和参数；保存后配置写入 `data/skills.json`。可在同页单独测试。
4. 在 **Tool 管理** 中查看本地 Tool 的输入/输出结构，启用或禁用 Tool，并填写 JSON 参数进行测试。Coze 工作流的名称、描述、Workflow ID、API Base URL 和 Token 环境变量名也可在此设置。
5. 在 **执行日志** 中查看 Agent 执行历史，打开某条记录可检查完整输入、输出、证据和风险审核，也可删除该记录。

## 可选 API 配置

从示例文件创建本地配置文件：

```powershell
Copy-Item .env.example .env
```

在 `.env` 中填写需要的配置，然后重启服务。启动进程已有的环境变量优先于 `.env` 中的同名值。

```dotenv
# 兼容 OpenAI Chat Completions 的模型服务
OPENAI_API_KEY=你的模型API密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 服务端口
PORT=3000

# 可选：Coze 工作流
COZE_API_TOKEN=你的Coze访问令牌
COZE_API_TOKEN_VAR=可选的系统环境变量名
COZE_BASE_URL=https://api.coze.cn
COZE_WORKFLOW_ID=7661245829961302052
```

模型请求地址由 `OPENAI_BASE_URL` 加 `/chat/completions` 组成。每个 Skill 可在管理页设置自己的模型名、Temperature 和 Max Tokens。未配置模型密钥或请求失败时，该次生成使用 Mock 结果。

Coze Token 只由服务器读取。Tool 管理页只显示凭证是否检测到，不展示 Token 内容；在 Windows 上也会尝试从用户或系统环境变量读取配置的 Token。**运行 Coze Tool 测试会向已配置的 Coze 工作流发送请求。**没有检测到 Token 时，接口返回明确的 Mock 输出，不会伪装成真实执行结果。

## 输入与输出示例

### Agent 入职问题

发送到 `POST /api/execute`：

```json
{
  "employee_id": "E001",
  "question": "我入职第一天需要做什么？"
}
```

返回值包括最终回复、Planner 结构化结果和计划、逐步执行详情、风险审核以及本地证据摘要。内容会随员工资料、Skill 配置、模型是否可用而变化。响应结构示例：

```json
{
  "id": "执行记录ID",
  "created_at": "2026-10-12T08:00:00.000Z",
  "question": "我入职第一天需要做什么？",
  "employee_id": "E001",
  "employee_name": "张明",
  "planner": {
    "structured": {
      "intent": "query_onboarding_tasks",
      "need_onboarding_task_query": true
    },
    "plan": [
      { "index": 1, "kind": "skill", "id": "structure", "name": "入职问题结构化" },
      { "index": 2, "kind": "tool", "id": "employee_lookup", "name": "查询员工信息" }
    ]
  },
  "steps": [
    { "index": 1, "kind": "skill", "id": "structure", "input": {}, "output": {} },
    { "index": 2, "kind": "tool", "id": "employee_lookup", "input": {}, "output": {} }
  ],
  "final_reply": "你好，张明。……（回复内容以本次执行结果为准）",
  "risk": {
    "risk_level": "low",
    "passed": true,
    "issues": [],
    "required_changes": [],
    "suggestions": ["回复基于本地模拟数据；个人制度和状态请以 HR 确认为准。"]
  },
  "evidence_summary": ["本地任务记录：提交入职材料……"],
  "mode": "mock"
}
```

上面展示的是字段示例，不是固定回复。实际 `steps` 会包含本次执行的所有 Skill 和 Tool，`risk` 也可能返回其他等级或审核结果。

### Coze 工作流 Tool

发送到 `POST /api/tools/coze_workflow`：

```json
{
  "user_id": "demo_user_001",
  "CONVERSATION_NAME": "新员工入职咨询",
  "USER_INPUT": "我入职第一天需要做什么？"
}
```

成功时返回三个字符串字段：

```json
{
  "answer": "工作流返回的回答内容",
  "status": "工作流返回的状态",
  "risk_level": "工作流返回的风险等级"
}
```

没有配置 Coze Token 时，返回 `status: "mock"`、`risk_level: "unknown"` 以及提示尚未调用外部工作流的 `answer`。输入字段缺失或类型不正确时，接口返回错误。

## HTTP API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务健康状态 |
| `GET` | `/api/bootstrap` | 初始化员工、Skill、Tool 和运行模式 |
| `POST` | `/api/execute` | 执行 Agent 入职问答并保存日志 |
| `GET` | `/api/skills` | 获取 Skill 配置 |
| `GET` | `/api/skills/:id` | 获取单个 Skill |
| `PUT` | `/api/skills/:id` | 更新 Skill 配置 |
| `POST` | `/api/skills/:id/test` | 单独测试启用的 Skill |
| `GET` | `/api/tools` | 获取 Tool 配置及凭证检测状态 |
| `GET` | `/api/tools/:id` | 获取单个 Tool 配置 |
| `PUT` | `/api/tools/:id` | 更新 Tool 名称、说明、启用状态或 Coze 配置 |
| `POST` | `/api/tools/:id` | 运行指定 Tool；Coze Tool 可能调用外部工作流 |
| `GET` | `/api/data/:name.json` | 读取服务端白名单中的本地数据文件 |
| `GET` | `/api/logs` | 获取执行日志 |
| `GET` | `/api/logs/summary` | 获取日志数量 |
| `DELETE` | `/api/logs/:id` | 删除单条执行日志 |

## 项目数据

本地 JSON 文件位于 `data/`：

| 文件 | 内容 |
| --- | --- |
| `employees.json` | 模拟员工资料和入职状态 |
| `onboarding_tasks.json` | 入职任务、阶段、优先级和负责人 |
| `contacts.json` | 演示用业务联系人 |
| `policies.json` | 演示用制度摘要和正文 |
| `trainings.json` | 培训安排 |
| `skills.json` | Skill 提示词、模型参数和启用状态 |
| `tools.json` | Tool 注册信息、启用状态及 Coze 配置 |
| `execution_logs.json` | 最近最多 200 条 Agent 执行记录 |

六个 Skill 的原始 Markdown 文档位于 `docs/skills/`。直接编辑 JSON 前请先停止服务并备份文件；该 MVP 没有多进程写入锁或自动备份。

## 当前限制

- 示例员工、任务、制度、联系人和培训均为本地演示资料；项目没有接入企业 HR、OA 或统一知识库。
- 页面中的员工选择是模拟身份，不构成真实认证或访问控制。不要存入真实员工个人信息、公司机密或生产凭证。
- 本地 Tool 查询数据；模型只基于传入上下文生成内容。Mock 风险检查是演示逻辑，不代替人工审核、法律意见或企业合规流程。
- 单进程 JSON 存储适合本地 MVP，不适合高并发或直接作为生产服务。
