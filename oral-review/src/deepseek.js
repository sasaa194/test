import { config } from './config.js';

// DeepSeek 只负责根据评测结果生成中文老师评语，不做任何音频分析
export async function chat(messages, { temperature = 0.7 } = {}) {
  const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepseek.apiKey()}`,
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`评语生成服务请求失败: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('评语生成服务返回为空');
  return content;
}
