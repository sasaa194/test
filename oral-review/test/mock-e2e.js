// 离线 Mock 端到端测试：不出网，验证 解析→评语提示词→消息模板 的数据流
// 真网闭环由 scripts/seed-test-record.js + src/index.js 完成
import assert from 'node:assert';
import { parseResult } from '../src/aliyun.js';
import { buildTeacherMessage } from '../src/pipeline.js';

// 模拟驰声/智能科教返回（字段名以官方文档为准，parseResult 做了兼容）
const mockEvalResponse = {
  result: {
    overall: 82,
    pron: 78,
    integrity: 95,
    fluency: { overall: 80, pause: 2, speed: 118 },
    rhythm: { overall: 75 },
    details: [
      {
        text: 'The sun rises in the east and the birds begin to sing.',
        fluency: { pause: 1 },
        words: [
          { word: 'rises', score: 45 },
          { word: 'east', score: 88 },
          { word: 'birds', score: 52, pause: { duration: 800, type: 1 } },
        ],
      },
    ],
  },
};

const parsed = parseResult(mockEvalResponse);
assert.equal(parsed.overall, 82);
assert.equal(parsed.accuracy, 78);
assert.equal(parsed.fluency, 80);
assert.equal(parsed.integrity, 95);
assert.equal(parsed.rhythm, 75);
assert.deepEqual(parsed.lowWords.map((w) => w.word), ['rises', 'birds']);
assert.ok(parsed.pauses.length >= 1);

const msg = buildTeacherMessage({
  student: '测试学生小明',
  evalResult: parsed,
  mainIssues: 'rises、birds 两个词发音偏弱；birds 后有一处明显停顿。',
  comment: '小明这次朗读整体完成得很好…（此处为 DeepSeek 生成的 220-420 字评语）',
});

const expectHead = `学生：测试学生小明
发音总分：82
准确度：78
流利度：80
完整度：95
韵律：75

主要问题：`;
assert.ok(msg.startsWith(expectHead), '消息模板不符合规格');
assert.ok(msg.includes('可复制评语：'));

console.log('mock-e2e 通过 ✅');
console.log('--- 消息预览 ---');
console.log(msg);
