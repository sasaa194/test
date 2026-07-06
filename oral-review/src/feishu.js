import { config } from './config.js';
import { log } from './log.js';

// 飞书开放平台 API 客户端（自建应用 tenant_access_token 模式）
// 文档: https://open.feishu.cn/document/

let tokenCache = { token: null, expireAt: 0 };

export async function tenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expireAt - 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${config.feishu.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.feishu.appId(), app_secret: config.feishu.appSecret() }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取 tenant_access_token 失败: code=${data.code} msg=${data.msg}`);
  tokenCache = { token: data.tenant_access_token, expireAt: Date.now() + data.expire * 1000 };
  return tokenCache.token;
}

export async function api(method, path, { body, query, raw } = {}) {
  const token = await tenantToken();
  let url = `${config.feishu.baseUrl}${path}`;
  if (query) url += `?${new URLSearchParams(query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书 API ${method} ${path} 失败: code=${data.code} msg=${data.msg}`);
  }
  return data.data;
}

// ---------- 多维表格 ----------

export async function searchRecords(appToken, tableId, filterConditions, pageSize = 20) {
  const data = await api('POST', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`, {
    query: { page_size: String(pageSize) },
    body: filterConditions
      ? { filter: { conjunction: 'and', conditions: filterConditions } }
      : {},
  });
  return data.items || [];
}

export async function updateRecord(appToken, tableId, recordId, fields) {
  return api('PUT', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    body: { fields },
  });
}

export async function createRecord(appToken, tableId, fields) {
  return api('POST', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
    body: { fields },
  });
}

// ---------- 附件下载 ----------

// 多维表格附件需带 extra 参数获取临时下载链接
export async function getAttachmentUrl(fileToken, appToken, tableId) {
  const extra = JSON.stringify({
    bitablePerm: { tableId, attachments: { [fileToken]: [fileToken] } },
  });
  const data = await api('GET', '/open-apis/drive/v1/medias/batch_get_tmp_download_url', {
    query: { file_tokens: fileToken, extra },
  });
  const item = (data.tmp_download_urls || [])[0];
  if (!item?.tmp_download_url) throw new Error('获取音频临时下载链接失败');
  return item.tmp_download_url;
}

export async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载音频失败: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// 直接走 media download 接口（batch_get_tmp_download_url 不可用时的备选）
export async function downloadMedia(fileToken, appToken, tableId) {
  const extra = JSON.stringify({
    bitablePerm: { tableId, attachments: { [fileToken]: [fileToken] } },
  });
  const res = await api('GET', `/open-apis/drive/v1/medias/${fileToken}/download`, {
    query: { extra },
    raw: true,
  });
  if (!res.ok) throw new Error(`下载音频失败: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- 消息 ----------

export async function getUserIdByEmail(email) {
  const data = await api('POST', '/open-apis/contact/v3/users/batch_get_id', {
    query: { user_id_type: 'open_id' },
    body: { emails: [email] },
  });
  const user = (data.user_list || []).find((u) => u.user_id);
  if (!user) throw new Error(`通过邮箱找不到飞书用户（该邮箱需在飞书账号上绑定）`);
  return user.user_id;
}

export async function sendTextMessage(openId, text) {
  return api('POST', '/open-apis/im/v1/messages', {
    query: { receive_id_type: 'open_id' },
    body: {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}

// ---------- 建表/表单等 setup 用 ----------

export async function createBitableApp(name) {
  return api('POST', '/open-apis/bitable/v1/apps', { body: { name } });
}

export async function createTable(appToken, tableSpec) {
  return api('POST', `/open-apis/bitable/v1/apps/${appToken}/tables`, { body: { table: tableSpec } });
}

export async function listTables(appToken) {
  const data = await api('GET', `/open-apis/bitable/v1/apps/${appToken}/tables`);
  return data.items || [];
}

export async function deleteTable(appToken, tableId) {
  return api('DELETE', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}`);
}

export async function createFormView(appToken, tableId, viewName) {
  return api('POST', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/views`, {
    body: { view_name: viewName, view_type: 'form' },
  });
}

export async function patchForm(appToken, tableId, formId, patch) {
  return api('PATCH', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/forms/${formId}`, {
    body: patch,
  });
}

export async function getForm(appToken, tableId, formId) {
  return api('GET', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/forms/${formId}`);
}

// 开启链接分享，让用户拿链接就能看表
export async function enableLinkShare(appToken) {
  return api('PATCH', `/open-apis/drive/v1/permissions/${appToken}/public`, {
    query: { type: 'bitable' },
    body: {
      external_access: false,
      link_share_entity: 'tenant_editable',
      invite_external: false,
    },
  });
}
