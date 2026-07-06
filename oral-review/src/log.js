// 日志统一走这里：自动把已知密钥打码，保证日志/报错不出现密钥
const SECRET_ENV_KEYS = [
  'FEISHU_APP_SECRET',
  'ALIYUN_ORAL_APP_SECRET',
  'DEEPSEEK_API_KEY',
];

function redact(text) {
  let s = String(text);
  for (const key of SECRET_ENV_KEYS) {
    const v = process.env[key];
    if (v && v.length >= 6) s = s.split(v).join('***');
  }
  // 兜底：常见 token 形态
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]{10,}/g, '$1***');
  s = s.replace(/\b(t-[a-z0-9]{8})[a-zA-Z0-9]+/g, '$1***');
  s = s.replace(/\bsk-[A-Za-z0-9]{8,}/g, 'sk-***');
  return s;
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const log = {
  info: (...args) => console.log(`[${ts()}] INFO `, ...args.map(redact)),
  warn: (...args) => console.warn(`[${ts()}] WARN `, ...args.map(redact)),
  error: (...args) => console.error(`[${ts()}] ERROR`, ...args.map(redact)),
};

export { redact };
