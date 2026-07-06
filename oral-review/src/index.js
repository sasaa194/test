import { config, FIELDS, STATUS, loadFeishuRuntime } from './config.js';
import { log } from './log.js';
import * as feishu from './feishu.js';
import { processRecord } from './pipeline.js';

// 后台常驻：轮询多维表格里"待处理"的口语作业并处理
const runtime = loadFeishuRuntime();
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const records = await feishu.searchRecords(runtime.appToken, runtime.tableId, [
      { field_name: FIELDS.status, operator: 'is', value: [STATUS.PENDING] },
    ]);
    if (records.length) log.info(`发现 ${records.length} 条待处理记录`);
    for (const rec of records) {
      await processRecord(runtime, rec);
    }
  } catch (e) {
    log.error(`轮询失败: ${e.message}`);
  } finally {
    busy = false;
  }
}

log.info(`口语作业点评后台启动，表=${runtime.tableId}，轮询间隔=${config.pollIntervalMs}ms`);
tick();
setInterval(tick, config.pollIntervalMs);
