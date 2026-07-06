import { config, FIELDS, STATUS } from './config.js';
import { log } from './log.js';
import * as feishu from './feishu.js';
import { evaluateAudio } from './aliyun.js';
import { generateComment } from './comment.js';

// 老师消息模板（严格按规格）
export function buildTeacherMessage({ student, evalResult, mainIssues, comment }) {
  const fmt = (v) => (v === null || v === undefined ? '—' : String(v));
  return `学生：${student}
发音总分：${fmt(evalResult.overall)}
准确度：${fmt(evalResult.accuracy)}
流利度：${fmt(evalResult.fluency)}
完整度：${fmt(evalResult.integrity)}
韵律：${fmt(evalResult.rhythm)}

主要问题：
${mainIssues}

可复制评语：
${comment}`;
}

export function resolveTeacherEmail(teacherName) {
  return config.teacher.map[teacherName] || config.teacher.defaultEmail;
}

function fieldText(v) {
  // 多维表格文本字段可能返回富文本数组
  if (Array.isArray(v)) return v.map((x) => x.text ?? '').join('');
  if (v && typeof v === 'object' && v.text) return v.text;
  return v == null ? '' : String(v);
}

function guessAudioType(name = '') {
  const ext = name.toLowerCase().split('.').pop();
  if (['wav', 'mp3', 'ogg', 'amr', 'm4a', 'aac', 'opus'].includes(ext)) return ext;
  return 'wav';
}

// 处理一条"待处理"记录，返回 true=成功 false=失败
export async function processRecord(runtime, record) {
  const { appToken, tableId } = runtime;
  const f = record.fields || {};
  const recordId = record.record_id;
  const student = fieldText(f[FIELDS.student]) || '未填写';
  const teacher = fieldText(f[FIELDS.teacher]);
  const refText = fieldText(f[FIELDS.refText]).trim();
  const attachments = f[FIELDS.audio] || [];

  const fail = async (reason) => {
    log.error(`记录 ${recordId} 处理失败: ${reason}`);
    await feishu.updateRecord(appToken, tableId, recordId, {
      [FIELDS.status]: STATUS.FAILED,
      [FIELDS.failReason]: String(reason).slice(0, 800),
      [FIELDS.processedAt]: Date.now(),
    });
    return false;
  };

  try {
    await feishu.updateRecord(appToken, tableId, recordId, { [FIELDS.status]: STATUS.PROCESSING });

    if (!refText) return await fail('缺少朗读原文');
    if (!attachments.length) return await fail('缺少音频附件');

    // 1. 下载音频
    const att = attachments[0];
    let audioBuffer;
    try {
      const url = await feishu.getAttachmentUrl(att.file_token, appToken, tableId);
      audioBuffer = await feishu.downloadFile(url);
    } catch (e) {
      log.warn(`临时链接下载失败，改走 media download: ${e.message}`);
      audioBuffer = await feishu.downloadMedia(att.file_token, appToken, tableId);
    }
    log.info(`记录 ${recordId}: 音频已下载 ${audioBuffer.length} bytes (${att.name})`);

    // 2. 语音评测
    const evalResult = await evaluateAudio({
      audioBuffer,
      refText,
      audioType: guessAudioType(att.name),
    });
    log.info(`记录 ${recordId}: 评测完成 总分=${evalResult.overall}`);

    // 3. 生成评语
    const { mainIssues, comment } = await generateComment({ studentName: student, refText, evalResult });

    // 4. 写回表格
    await feishu.updateRecord(appToken, tableId, recordId, {
      [FIELDS.overall]: evalResult.overall,
      [FIELDS.accuracy]: evalResult.accuracy,
      [FIELDS.fluency]: evalResult.fluency,
      [FIELDS.integrity]: evalResult.integrity,
      [FIELDS.rhythm]: evalResult.rhythm,
      [FIELDS.issues]: mainIssues,
      [FIELDS.comment]: comment,
      [FIELDS.failReason]: '',
      [FIELDS.processedAt]: Date.now(),
    });

    // 5. 机器人推送老师
    const email = resolveTeacherEmail(teacher);
    if (!email) return await fail(`老师"${teacher}"没有配置接收邮箱（TEACHER_MAP_JSON / TEACHER_DEFAULT_EMAIL）`);
    const openId = await feishu.getUserIdByEmail(email);
    await feishu.sendTextMessage(openId, buildTeacherMessage({ student, evalResult, mainIssues, comment }));

    await feishu.updateRecord(appToken, tableId, recordId, { [FIELDS.status]: STATUS.SENT });
    log.info(`记录 ${recordId}: 已推送老师并置状态=已发送老师`);
    return true;
  } catch (e) {
    return await fail(e.message || String(e));
  }
}
