/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* ===== 同属性的纯数值调整 → 合并成三列表格 =====
   只认「● 对象名」+ 一行「属性 旧 → 新。」，同一分组内连续 ≥3 条、
   属性名完全一致即可合并（数值写法不强求一致，25/60 与 30 也可以同表）；
   带技能名、档位、多行说明或额外改动的条目一律不参与，避免错并。 */
const TBL_TIER = /^(基础技能|技能|被动|技能前摇|技能后摇|觉醒|觉醒后|\d+级)$/;
/* 对象名里带这些词，说明它是某一个技能 / 档位，不是英雄本体，不参与并表 */
const TBL_SKILLISH = /(技能|被动|普攻|普通攻击|大招|绝技|觉醒|\d+级)/;
const TBL_BAD_VAL = /[，。；、：:！？!?（）()【】「」“”"'`\s]|提升|降低|新增|移除|删除|改为|调整|统一|额外|同时|并且|由|从|至/;

/* 解析单条「属性 旧 → 新。」；不是这种形态就返回 null（绝不猜测） */
function parseValuePair(it) {
  const name = String((it && it.t) || '').trim();
  const desc = String((it && it.d) || '').trim();
  if (!name || !desc || desc.indexOf('\n') >= 0) return null;
  if (name.length > 12 || /[·・|｜，。；、：:（）()【】]/.test(name)) return null;
  if (TBL_TIER.test(name) || DIGEST_TIER.test(name) || TBL_SKILLISH.test(name)) return null;
  const m = desc.replace(/。$/, '').trim().match(
    /^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9]{1,9})\s*[：:]?\s*(?:调整前[：:]?\s*)?([^\s，。；、：:→]{1,10})\s*(?:→|->)\s*(?:调整后[：:]?\s*)?([^\s，。；、：:→]{1,10})$/
  );
  if (!m) return null;
  const attr = m[1], a = m[2], b = m[3];
  const okVal = v => /\d/.test(v) && !TBL_BAD_VAL.test(v);
  if (!okVal(a) || !okVal(b)) return null;
  return { name, attr, a, b };
}

/* 表格第一列的对象名：按分组 / 章节名推导 */
function tableColumnName(sec, grp) {
  const src = String((sec && sec.name) || '') + ' ' + String((grp && grp.name) || '');
  const keys = ['棋手', '英雄', '天赋', '卡牌', '羁绊', '装备', '技能'];
  for (const k of keys) if (src.indexOf(k) >= 0) return k;
  return '名称';
}

function makeValueTable(sec, grp, run) {
  return {
    t: /调整$/.test(run.attr) ? run.attr : run.attr + '调整',
    d: '',
    table: {
      head: [tableColumnName(sec, grp), '调整前', '调整后'],
      rows: run.rows.map(r => [r.name, r.a, r.b])
    }
  };
}

function mergeValueTables(sections) {
  (sections || []).forEach(sec => {
    (sec.groups || []).forEach(grp => {
      const src = grp.items || [];
      const out = [];
      let run = null;
      const flush = () => {
        if (!run) return;
        if (run.rows.length >= 3) out.push(makeValueTable(sec, grp, run));
        else run.rows.forEach(r => out.push(r.it));
        run = null;
      };
      src.forEach(it => {
        /* 带技能子条目的棋手卡不参与并表 */
        const p = (it.kids && it.kids.length) ? null : parseValuePair(it);
        if (!p) { flush(); out.push(it); return; }
        /* 属性变了或对象重名 → 断组，重新计数 */
        if (run && (p.attr !== run.attr || run.names.has(p.name))) flush();
        if (!run) run = { attr: p.attr, names: new Set(), rows: [] };
        run.names.add(p.name);
        run.rows.push({ it, name: p.name, a: p.a, b: p.b });
      });
      flush();
      grp.items = out;
    });
  });
  return sections;
}

/* 从导入内容识别服务器 / 日期：@@META 行、JSON 元信息、文本关键字兜底 */
function extractMeta(text) {
  let server = '', date = '';
  let clean = String(text || '');
  const raw = clean.trim();
  if (/^[\[{]/.test(raw)) {
    try {
      const obj = JSON.parse(raw);
      if (obj && !Array.isArray(obj)) {
        const sv = String(obj.server || '').trim();
        if (/^(正式服|体验服)$/.test(sv)) server = sv;
        const dv = String(obj.date || '').trim();
        if (/^\d{1,2}\.\d{1,2}$/.test(dv)) date = dv;
      }
    } catch (e) { /* 不是合法 JSON 就按文本处理 */ }
  }
  const kept = [];
  clean.split('\n').forEach(line => {
    const m = line.match(/^\s*(?:【元信息】)?\s*[@＠]{2}META\s*(.*)$/i)
      || line.match(/^\s*【元信息】\s*(.*)$/);
    if (m) {
      const sm = m[1].match(/服务器\s*[=:：]\s*(正式服|体验服)/);
      const dm = m[1].match(/日期\s*[=:：]\s*(\d{1,2})[.\-/](\d{1,2})/);
      if (sm) server = sm[1];
      if (dm) date = (+dm[1]) + '.' + (+dm[2]);
      return;
    }
    const sm = line.match(/^\s*服务器\s*[=:：]\s*(正式服|体验服)\s*$/);
    if (sm) { server = sm[1]; return; }
    kept.push(line);
  });
  clean = kept.join('\n');
  /* 旧提示词没有元信息时，按正文关键词兜底；都识别不到就不改当前选择 */
  if (!server) {
    if (/体验服/.test(clean)) server = '体验服';
    else if (/正式服/.test(clean)) server = '正式服';
  }
  if (!date) {
    const dm = clean.match(/(\d{1,2})月(\d{1,2})日/);
    if (dm) date = (+dm[1]) + '.' + (+dm[2]);
  }
  return { server, date, text: clean };
}

