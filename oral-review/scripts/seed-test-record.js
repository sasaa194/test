import fs from 'node:fs';
import path from 'node:path';
import { config, FIELDS, STATUS, loadFeishuRuntime } from '../src/config.js';
import { log } from '../src/log.js';
import * as feishu from '../src/feishu.js';

// 造一条端到端测试数据：上传测试音频 → 插入"待处理"记录
// 音频: test/fixtures/sample-16k.wav（espeak-ng 合成的英文朗读）

const SAMPLE_TEXT =
  'The sun rises in the east and the birds begin to sing. I like to read English books with my friends after school. Practice makes perfect.';

async function uploadAttachment(appToken, filePath) {
  const token = await feishu.tenantToken();
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file_name', path.basename(filePath));
  form.append('parent_type', 'bitable_file');
  form.append('parent_node', appToken);
  form.append('size', String(buf.length));
  form.append('file', new Blob([buf]), path.basename(filePath));
  const res = await fetch(`${config.feishu.baseUrl}/open-apis/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`上传附件失败: code=${data.code} msg=${data.msg}`);
  return data.data.file_token;
}

async function main() {
  const runtime = loadFeishuRuntime();
  const audioPath = path.join(config.root, 'test/fixtures/sample-16k.wav');
  log.info('上传测试音频…');
  const fileToken = await uploadAttachment(runtime.appToken, audioPath);
  log.info('插入测试记录…');
  const rec = await feishu.createRecord(runtime.appToken, runtime.tableId, {
    [FIELDS.student]: '测试学生小明',
    [FIELDS.teacher]: '王老师',
    [FIELDS.refText]: SAMPLE_TEXT,
    [FIELDS.audio]: [{ file_token: fileToken }],
    [FIELDS.status]: STATUS.PENDING,
  });
  log.info(`测试记录已插入: ${rec.record?.record_id}，等待后台轮询处理`);
}

main().catch((e) => {
  log.error(e.message);
  process.exit(1);
});
