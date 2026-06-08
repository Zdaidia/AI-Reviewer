# AI 模型配置说明

## 默认配置：routerTeam

本项目已配置默认 AI 模型为 **routerTeam**，使用以下配置：

```json
{
  "name": "routerTeam",
  "provider": "claude-code",
  "apiKey": "sk-GhM2nKkY7mzEUHviI65lHkHLnBUgpt0j2I7NVN14j0KMxb5H",
  "apiEndpoint": "https://ai.router.team",
  "model": "glm-5",
  "temperature": 0.2,
  "maxTokens": 2000
}
```

## 配置文件位置

### 1. 项目级配置（优先级最高）
- 文件路径：`E:\AI\dev-quality-inspector\.ai-config.json`
- 作用范围：仅当前项目
- 优先级：最高

### 2. 用户级配置
- 文件路径：`~/.dqi-ai-config.json`
- 作用范围：所有项目
- 优先级：中等

### 3. 代码内置配置
- 位置：`src/core/electron/main.js`
- 作用范围：默认配置
- 优先级：最低

## 配置加载顺序

1. 首先检查项目根目录的 `.ai-config.json`
2. 如果不存在，检查用户目录的 `.dqi-ai-config.json`
3. 如果都不存在，使用代码中的默认配置

## 修改配置的方式

### 方式 1：通过 UI 界面（推荐）
1. 打开应用
2. 点击工具栏的"设置"按钮
3. 在"AI Configuration"中修改配置
4. 点击"Save Configuration"

### 方式 2：直接编辑配置文件
编辑 `.ai-config.json` 文件，修改相应字段。

### 方式 3：修改环境变量
在 `main.js` 中设置环境变量：
```javascript
process.env.ANTHROPIC_AUTH_TOKEN = 'your-api-key';
process.env.ANTHROPIC_BASE_URL = 'your-endpoint';
```

## 支持的模型

- **glm-5**（推荐）- 智谱 AI GLM-5，高质量代码审查
- **glm-4-flash** - 快速响应，适合需求分析
- **glm-4** - 标准模型
- **gpt-4-turbo** - OpenAI GPT-4 Turbo
- **gpt-4** - OpenAI GPT-4
- **gpt-3.5-turbo** - OpenAI GPT-3.5

## 配置项说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `name` | 配置名称 | routerTeam |
| `provider` | AI 提供商 | claude-code |
| `apiKey` | API 密钥 | sk-GhM2nKkY... |
| `apiEndpoint` | API 端点 | https://ai.router.team |
| `model` | 模型名称 | glm-5 |
| `temperature` | 温度参数（0-1） | 0.2 |
| `maxTokens` | 最大 token 数 | 2000 |

## 注意事项

1. **API Key 安全**：请勿将包含真实 API Key 的配置文件提交到公共代码仓库
2. **模型回退**：当首选模型不可用时，系统会自动回退到备用模型
3. **配置优先级**：项目级配置 > 用户级配置 > 代码默认配置
