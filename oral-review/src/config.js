import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 轻量 .env 加载（不引第三方依赖）；已存在的环境变量优先
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（请配置 .env，参考 .env.example）`);
  return v;
}

// 飞书侧运行时配置（由 scripts/setup-bitable.js 生成）
export function loadFeishuRuntime() {
  const p = path.join(ROOT, 'feishu-config.json');
  if (!fs.existsSync(p)) {
    throw new Error('缺少 feishu-config.json，请先运行 npm run setup');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function saveFeishuRuntime(cfg) {
  const p = path.join(ROOT, 'feishu-config.json');
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}

export const config = {
  root: ROOT,
  feishu: {
    appId: () => required('FEISHU_APP_ID'),
    appSecret: () => required('FEISHU_APP_SECRET'),
    baseUrl: process.env.FEISHU_BASE_URL || 'https://open.feishu.cn',
  },
  aliyun: {
    appId: () => required('ALIYUN_ORAL_APP_ID'),
    appSecret: () => required('ALIYUN_ORAL_APP_SECRET'),
    // 智能科教内容生成平台评测接口域名；细节以 help.aliyun.com 官方文档为准
    baseUrl: process.env.ALIYUN_EVAL_BASE_URL || 'https://aiservice.ssapi.cn',
    coreType: process.env.ALIYUN_CORE_TYPE || 'en.pred.score',
  },
  deepseek: {
    apiKey: () => required('DEEPSEEK_API_KEY'),
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
  },
  // 第一版：所有老师消息发给这个人（充当老师）。多老师映射走 TEACHER_MAP_JSON，如
  // {"张老师":"zhang@example.com","李老师":"li@example.com"}
  teacher: {
    defaultEmail: process.env.TEACHER_DEFAULT_EMAIL || '',
    map: JSON.parse(process.env.TEACHER_MAP_JSON || '{}'),
  },
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 20000),
};

export const STATUS = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  SENT: '已发送老师',
  FAILED: '处理失败',
};

export const FIELDS = {
  student: '学生姓名',
  teacher: '老师',
  refText: '朗读原文',
  audio: '音频附件',
  status: '处理状态',
  overall: '发音总分',
  accuracy: '准确度',
  fluency: '流利度',
  integrity: '完整度',
  rhythm: '韵律分',
  issues: '主要问题',
  comment: 'AI评语',
  failReason: '失败原因',
  processedAt: '处理时间',
};
