# 英语口语作业自动点评系统

学生提交（飞书表单）→ 多维表格 → 后台轮询 → 阿里云智能科教语音评测 → DeepSeek 生成老师评语 → 写回表格 → 飞书机器人推送老师。

## 闭环流程

1. 学生打开飞书表单：填 **学生姓名 / 选择老师 / 粘贴朗读英文原文 / 上传音频**
2. 记录进入多维表格「口语作业提交表」，初始状态 **待处理**
3. `src/index.js` 常驻轮询待处理记录：下载音频 → 阿里云语音评测（`en.pred.score`，以朗读原文为参考文本）→ DeepSeek 生成中文评语
4. 评分（发音总分/准确度/流利度/完整度/韵律分）、主要问题、AI评语、处理时间、状态写回表格
5. 机器人「口语作业点评」按老师映射推送点评消息

状态机：`待处理 → 处理中 → 已发送老师 / 处理失败`（失败原因落表）。

## 目录

| 路径 | 作用 |
|---|---|
| `src/index.js` | 后台常驻轮询入口（`npm start`） |
| `src/pipeline.js` | 单条记录处理流水线 + 老师消息模板 |
| `src/aliyun.js` | 阿里云智能科教语音评测客户端（签名 + 请求 + 结果解析） |
| `src/comment.js` / `src/deepseek.js` | 评语生成（仅 DeepSeek，只做文本，不碰音频） |
| `src/feishu.js` | 飞书开放平台客户端（表格/附件/消息/建表） |
| `scripts/setup-bitable.js` | 一次性建表+表单，输出学生表单和后台表格链接（`npm run setup`） |
| `scripts/seed-test-record.js` | 造测试数据端到端跑闭环（`npm run seed`） |
| `scripts/fetch-aliyun-docs.sh` | 拉官方文档核对评测接口细节 |
| `test/mock-e2e.js` | 离线 mock 数据流测试（`npm run test:mock`） |
| `test/fixtures/sample-16k.wav` | 合成的英文测试音频（16k/16bit/mono） |

## 部署步骤

1. 飞书开放平台创建**自建应用**「口语作业点评」，添加**机器人**能力，开通权限：
   `bitable:app`（多维表格读写）、`drive:drive`（附件上传下载）、`im:message`（发消息）、`contact:user.base:readonly` + 邮箱查询 open_id 相关权限，发布版本。
2. `cp .env.example .env` 填入全部密钥（密钥只进环境变量，不进代码）。
3. `npm run setup` —— 创建多维表格 + 学生表单，链接写入 `feishu-config.json` 并打印。
4. `npm start` —— 启动后台轮询。
5. `npm run seed` —— 插入一条测试记录验证全闭环。

## 注意

- 评测接口细节以 help.aliyun.com「智能科教内容生成平台」官方文档为准（段落跟读：document_detail/2996315）。首次部署先跑 `scripts/fetch-aliyun-docs.sh` 核对 `src/aliyun.js` 中的签名与请求结构。
- 严禁替换为 Azure/腾讯云/Google/OpenAI 等其他音频评测服务。
- 日志经 `src/log.js` 统一打码，不输出密钥。
