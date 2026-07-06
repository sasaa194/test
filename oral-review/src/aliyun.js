import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';

// 阿里云"智能科教内容生成平台"语音评测（驰声引擎，域名 aiservice.ssapi.cn）
// 段落朗读/跟读题型 coreType: en.pred.score
//
// ⚠️ 接口细节以 help.aliyun.com 官方文档为准：
//   - 段落跟读题型 API 参考: https://help.aliyun.com/zh/document_detail/2996315.html
//   - 当前实现基于驰声标准 HTTP 评测协议（connect/start + sha1 签名 + multipart 音频），
//     实跑前必须先核对文档（见仓库 TODO / scripts/fetch-aliyun-docs.sh）。
//   - 如文档与此实现有出入，仅需调整 buildParams / endpoint / 解析三处。

function sig(appId, secret, timestamp) {
  // 驰声标准签名: sha1(appKey + timestamp + secretKey) 小写十六进制
  return crypto.createHash('sha1').update(appId + timestamp + secret).digest('hex');
}

function buildParams({ refText, userId = 'oral-review-bot', audioType = 'wav', sampleRate = 16000 }) {
  const appId = config.aliyun.appId();
  const secret = config.aliyun.appSecret();
  const timestamp = String(Date.now());
  return {
    connect: {
      cmd: 'connect',
      param: {
        sdk: { version: 16777472, source: 9, protocol: 2 },
        app: { applicationId: appId, sig: sig(appId, secret, timestamp), timestamp, alg: 'sha1' },
      },
    },
    start: {
      cmd: 'start',
      param: {
        app: { userId, applicationId: appId, sig: sig(appId, secret, timestamp), timestamp, alg: 'sha1' },
        audio: { audioType, channel: 1, sampleBytes: 2, sampleRate },
        request: {
          coreType: config.aliyun.coreType,
          refText,
          rank: 100,
          attachAudioUrl: 1,
          result: { details: { gop_adjust: 1 } },
        },
      },
    },
  };
}

export async function evaluateAudio({ audioBuffer, refText, audioType = 'wav', sampleRate = 16000 }) {
  const params = buildParams({ refText, audioType, sampleRate });
  const endpoint = `${config.aliyun.baseUrl}/${config.aliyun.coreType}`;

  const form = new FormData();
  form.append('text', JSON.stringify(params));
  form.append('audio', new Blob([audioBuffer], { type: 'application/octet-stream' }), 'audio.' + audioType);

  const res = await fetch(endpoint, { method: 'POST', body: form });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`语音评测请求失败: HTTP ${res.status} ${bodyText.slice(0, 300)}`);
  }
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`语音评测返回非 JSON: ${bodyText.slice(0, 300)}`);
  }
  if (data.error || data.errId || data.err_no) {
    throw new Error(`语音评测返回错误: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return parseResult(data);
}

// 从评测返回中提取: 总分/准确度/流利度/完整度/韵律 + 低分词 + 停顿
export function parseResult(data) {
  const r = data.result || data;
  const num = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : null);

  const overall = num(r.overall);
  const accuracy = num(r.pron ?? r.accuracy);
  const fluency = num(typeof r.fluency === 'object' ? r.fluency?.overall : r.fluency);
  const integrity = num(r.integrity);
  const rhythm = num(typeof r.rhythm === 'object' ? r.rhythm?.overall : r.rhythm ?? r.tone);

  // 单词级细节：低分词、停顿。字段名以官方文档为准，这里做了多形态兼容。
  const lowWords = [];
  const pauses = [];
  const sentences = r.details || r.sentences || [];
  for (const sent of Array.isArray(sentences) ? sentences : []) {
    const words = sent.words || sent.details || [];
    for (const w of Array.isArray(words) ? words : []) {
      const text = w.word ?? w.text ?? w.chn_char;
      const score = w.score ?? w.overall ?? w.pron;
      if (text && typeof score === 'number' && score < 60) {
        lowWords.push({ word: text, score: Math.round(score) });
      }
      if (w.pause && (w.pause.duration ?? 0) > 0 && (w.pause.type === 1 || w.pause.abnormal)) {
        pauses.push({ after: text, durationMs: w.pause.duration });
      }
    }
    if (sent.fluency?.pause) pauses.push({ sentence: sent.text ?? '', count: sent.fluency.pause });
  }

  return {
    overall, accuracy, fluency, integrity, rhythm,
    lowWords: lowWords.slice(0, 10),
    pauses: pauses.slice(0, 10),
    raw: r,
  };
}
