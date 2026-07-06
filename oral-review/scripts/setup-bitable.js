import { FIELDS, STATUS, saveFeishuRuntime } from '../src/config.js';
import { log } from '../src/log.js';
import * as feishu from '../src/feishu.js';

// 一次性初始化：创建多维表格"口语作业提交表" + 学生提交表单，输出两个链接
// 前置：飞书自建应用已创建（名称：口语作业点评），.env 已配置 FEISHU_APP_ID/SECRET，
// 且应用已开通权限：bitable:app、drive:drive、im:message、contact:user.employee_id:readonly

const TABLE_NAME = '口语作业提交表';

const fieldSpecs = [
  { field_name: FIELDS.student, type: 1 }, // 文本
  {
    field_name: FIELDS.teacher,
    type: 3, // 单选
    property: { options: [{ name: '王老师' }, { name: '李老师' }, { name: '张老师' }] },
  },
  { field_name: FIELDS.refText, type: 1 },
  { field_name: FIELDS.audio, type: 17 }, // 附件
  {
    field_name: FIELDS.status,
    type: 3,
    property: {
      options: [
        { name: STATUS.PENDING },
        { name: STATUS.PROCESSING },
        { name: STATUS.SENT },
        { name: STATUS.FAILED },
      ],
    },
  },
  { field_name: FIELDS.overall, type: 2 },   // 数字
  { field_name: FIELDS.accuracy, type: 2 },
  { field_name: FIELDS.fluency, type: 2 },
  { field_name: FIELDS.integrity, type: 2 },
  { field_name: FIELDS.rhythm, type: 2 },
  { field_name: FIELDS.issues, type: 1 },
  { field_name: FIELDS.comment, type: 1 },
  { field_name: FIELDS.failReason, type: 1 },
  { field_name: FIELDS.processedAt, type: 5 }, // 日期
];

async function main() {
  log.info('创建多维表格应用…');
  const appData = await feishu.createBitableApp('口语作业点评');
  const appToken = appData.app.app_token;
  const bitableUrl = appData.app.url;
  log.info(`多维表格已创建: ${bitableUrl}`);

  log.info(`创建数据表 ${TABLE_NAME}…`);
  const tableData = await feishu.createTable(appToken, {
    name: TABLE_NAME,
    fields: fieldSpecs,
  });
  const tableId = tableData.table_id;

  // 删掉默认空表
  try {
    const tables = await feishu.listTables(appToken);
    for (const t of tables) {
      if (t.table_id !== tableId) await feishu.deleteTable(appToken, t.table_id);
    }
  } catch (e) {
    log.warn(`清理默认表失败（不影响使用）: ${e.message}`);
  }

  log.info('创建学生提交表单…');
  const viewData = await feishu.createFormView(appToken, tableId, '学生提交表单');
  const formId = viewData.view?.view_id || viewData.view_id;

  await feishu.patchForm(appToken, tableId, formId, {
    name: '英语口语作业提交',
    description: '请填写姓名、选择老师、粘贴朗读的英文原文，并上传你的朗读音频',
    shared: true,
    shared_limit: 'tenant_editable',
    submit_limit_once: false,
  });
  const form = await feishu.getForm(appToken, tableId, formId);
  const formUrl = form.form?.shared_url || form.shared_url;

  try {
    await feishu.enableLinkShare(appToken);
  } catch (e) {
    log.warn(`开启表格链接分享失败（可在界面手动开）: ${e.message}`);
  }

  const cfg = { appToken, tableId, formId, bitableUrl, formUrl };
  const p = saveFeishuRuntime(cfg);
  log.info(`配置已写入 ${p}`);
  console.log('\n====== 入口链接 ======');
  console.log(`学生表单: ${formUrl}`);
  console.log(`后台表格: ${bitableUrl}`);
}

main().catch((e) => {
  log.error(e.message);
  process.exit(1);
});
