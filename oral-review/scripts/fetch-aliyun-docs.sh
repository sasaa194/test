#!/usr/bin/env bash
# 网络放开后第一步：拉取官方文档核对接口细节（不许凭记忆猜）
# 段落跟读题型 API 参考 + FAQ + 鉴权
set -e
OUT="${1:-/tmp/aliyun-docs}"
mkdir -p "$OUT"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for id in 2996315 2996297 2846431 3002419 2996314; do
  echo "fetch $id"
  curl -sL -H "User-Agent: $UA" "https://help.aliyun.com/zh/document_detail/${id}.html" -o "$OUT/${id}.html" || true
done
ls -la "$OUT"
echo "重点核对 2996315.html：请求地址、签名字段与算法、text/audio 传参结构、返回字段名"
