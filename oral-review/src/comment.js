import { chat } from './deepseek.js';

// 根据评测结果生成：主要问题（给老师看的要点） + AI评语（给孩子看的完整评语）
export async function generateComment({ studentName, refText, evalResult }) {
  const facts = {
    发音总分: evalResult.overall,
    准确度: evalResult.accuracy,
    流利度: evalResult.fluency,
    完整度: evalResult.integrity,
    韵律: evalResult.rhythm,
    低分单词: evalResult.lowWords.map((w) => `${w.word}(${w.score}分)`),
    异常停顿: evalResult.pauses,
  };

  const system = `你是一位温和、有经验的小学英语老师，正在给学生的英语朗读作业写点评。
严格遵守以下规则：
1. 只依据我提供的"评测事实"写点评，绝不编造评测结果里没有的错误或细节；某项数据缺失就不提它。
2. 评语是给孩子看的，老师口吻，自然、温和、具体，220到420个中文字。
3. 评语结构：先整体评价；再讲"需要注意的小细节"，按 1.句法结构 2.发音表达 3.语调表现 三点展开（某点没有可说的就简单带过或给普适性建议，不要编造问题）；最后以鼓励结尾。
4. 不使用任何 Markdown 标题符号（#、*、-等排版符号都不要）。数字编号"1. 2. 3."可以用。
5. 可以带少量 emoji（👏🌟😊），最多三个，不堆砌。
6. 明确指出发音不准的单词、漏读、停顿、语调问题（仅限评测事实里有的）。
7. 绝不出现"阿里云""DeepSeek""API""模型""系统""评测引擎"等字眼，就像老师亲自听了录音。
8. 另外用一两句话概括"主要问题"，给老师快速浏览用，直接说要点。

输出 JSON：{"main_issues": "主要问题概括", "comment": "完整评语"}`;

  const user = `学生姓名：${studentName}
朗读原文：${refText}
评测事实：${JSON.stringify(facts, null, 2)}`;

  const raw = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 少数情况下模型没给纯 JSON，做一次提取
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('评语生成结果解析失败');
    parsed = JSON.parse(m[0]);
  }
  if (!parsed.comment || !parsed.main_issues) throw new Error('评语生成结果缺少字段');

  const len = [...String(parsed.comment)].length;
  if (len < 180 || len > 500) {
    // 长度明显跑偏时重试一次
    const retry = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
      { role: 'assistant', content: raw },
      { role: 'user', content: `评语长度当前约${len}字，不符合220-420个中文字的要求，请重写并输出同样格式的 JSON。` },
    ]);
    try {
      const p2 = JSON.parse(retry);
      if (p2.comment && p2.main_issues) parsed = p2;
    } catch { /* 保留第一次结果 */ }
  }

  return { mainIssues: String(parsed.main_issues).trim(), comment: String(parsed.comment).trim() };
}
