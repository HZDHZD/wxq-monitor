/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* 线上版本由 同步到线上.bat 从本地复制到仓库 docs 并推送 */
/* =======================  基础工具  ======================= */
const FONT = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Source Han Sans SC",sans-serif';

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx, size, weight) {
  ctx.font = `${weight || 400} ${Math.max(1, Math.round(size))}px ${FONT}`;
}

// 逐字换行，中英文混排友好
/* 中文标点禁则：这些字符不能出现在行首 / 行尾 */
const NO_START = '，。、；：！？）】》」』”’%,.;:!?)]}';
const NO_END = '（【《「『“‘([{';

function wrapText(ctx, text, maxWidth) {
  text = stripMarks(String(text == null ? '' : text)
    /* 数字和量词之间不留空格，避免「4 张」被拆成「4」「张」两行 */
    .replace(/(\d)\s+([张枚名点级秒个件次位只层星辰费])/g, '$1$2'));
  const out = [];
  text.split('\n').forEach(para => {
    /* 说明一律顶格：去掉每行行首的缩进（含空格、Tab、全角空格、不间断空格） */
    para = para.replace(/^[\s\u3000\u00a0]+/, '');
    if (para === '') { out.push(''); return; }
    const body = para;
    const lim = Math.max(1, maxWidth);
    /* 数字/百分比/×1.5 这类英文数字串作为一个整体，避免被拆成两行；
       数字后面紧跟的量词（4张、30点、8枚）和「→ 新值」也绑在一起，避免单位被甩到下一行 */
    const NUM = '×?[A-Za-z0-9]+(?:[.,:+\\-/%×=][A-Za-z0-9]+)*%?[张枚名点级秒个件次位只层星辰费]?';
    /* 常见双字词整词绑定，避免「提高」被拆成「提」「高了」这种看起来像缩进的行；长词放前面优先匹配 */
    const WORD = '已觉醒|刷新出|召唤出|抽取出|提高了|提升了|降低了|减少了|增加了|获得了|提高|提升|降低|减少|增加|获得|召唤|刷新|抽取|选择|持续|立即|额外|同时|并且|战斗|回合|准备|购买|出售|使用|消耗|恢复|造成|受到|替换|变成|视为|保留|移除|摧毁|发现|等级|费用|能量|概率|效果|技能|天赋|英雄|单位|卡牌';
    const tokens = body.match(new RegExp('\\s*→\\s*' + NUM + '|' + NUM + '|新增[：:]|' + WORD + '|[\\s\\S]', 'g')) || [];
    let cur = '';
    for (const tk of tokens) {
      const test = cur + tk;
      if (ctx.measureText(test).width > lim && cur !== '') {
        /* 标点避头：收尾类标点不放到下一行行首，允许轻微压出边界 */
        if (NO_START.indexOf(tk) >= 0) { cur = test; continue; }
        /* 行尾不留开括号 / 开引号，带到下一行 */
        let carry = '';
        while (cur.length > 1 && NO_END.indexOf(cur[cur.length - 1]) >= 0) {
          carry = cur[cur.length - 1] + carry;
          cur = cur.slice(0, -1);
        }
        out.push(cur);
        /* 换行后去掉行首空白（「→ 新值」整体换行时前面会带着空格） */
        cur = (carry + tk).replace(/^[\s\u3000\u00a0]+/, '');
        while (ctx.measureText(cur).width > lim && cur.length > 1) {
          let cut = cur.length - 1;
          while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > lim) cut--;
          out.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      } else cur = test;
    }
    if (cur !== '') out.push(cur);
  });
  return out.length ? out : [''];
}

/* 「觉醒前 / 觉醒后」各占一行，避免挤在同一段 */
function splitAwaken(text) {
  return String(text == null ? '' : text)
    .replace(/([；;。])\s*觉醒后/g, '$1\n觉醒后')
    /* 【炮击模式】【机枪模式】这类并列小节各占一行：
       句读后紧跟的方括号标签另起一行，避免多个模式被分号挤成一段 */
    .replace(/([；;。])\s*(?=【(?!新增|\/新增|改|\/改))/g, '$1\n');
}

/* 成对标记：新增内容 / 数值变化。
   绘制前先剥离标记，同时记下剥离后纯文本里的高亮区间，
   保证换行测量与绘制用的是同一份文字。 */
const MARK_OPEN = '【新增】';
const MARK_CLOSE = '【/新增】';
const VAL_OPEN = '【改】';
const VAL_CLOSE = '【/改】';
/* 图标字体的私用区字符（U+E000–U+F8FF）与解码残留（U+FFFD），
   我们的字体没有对应字形，只会画成方块，绘制前统一丢掉 */
const ICON_CHARS = /[\uE000-\uF8FF\uFFFD]/g;

function stripMarks(text) {
  return String(text == null ? '' : text)
    .split(MARK_OPEN).join('')
    .split(MARK_CLOSE).join('')
    .split(VAL_OPEN).join('')
    .split(VAL_CLOSE).join('')
    .replace(ICON_CHARS, '');
}

/* 剥离标记 → { plain, spans（新增）, vals（数值变化） }，区间都基于 plain */
function parseMarks(text) {
  const s = String(text == null ? '' : text).replace(ICON_CHARS, '');
  const buf = [];
  const spans = [], vals = [];
  let open = -1, openV = -1, i = 0;
  while (i < s.length) {
    if (s.startsWith(MARK_OPEN, i)) {
      if (open < 0) open = buf.length;
      i += MARK_OPEN.length;
      continue;
    }
    if (s.startsWith(MARK_CLOSE, i)) {
      if (open >= 0) { spans.push([open, buf.length]); open = -1; }
      i += MARK_CLOSE.length;
      continue;
    }
    if (s.startsWith(VAL_OPEN, i)) {
      if (openV < 0) openV = buf.length;
      i += VAL_OPEN.length;
      continue;
    }
    if (s.startsWith(VAL_CLOSE, i)) {
      if (openV >= 0) { vals.push([openV, buf.length]); openV = -1; }
      i += VAL_CLOSE.length;
      continue;
    }
    buf.push(s[i]);
    i++;
  }
  /* 漏写结束标记时，从开始标记一直着色到结尾，避免整段失去标记 */
  if (open >= 0) spans.push([open, buf.length]);
  if (openV >= 0) vals.push([openV, buf.length]);
  return { plain: buf.join(''), spans, vals };
}

/* 与 wrapText 相同的预处理：数字和量词之间不留空格、剥离新增标记 */
function descPrepared(text) {
  return parseMarks(String(text == null ? '' : text)
    .replace(/(\d)\s+([张枚名点级秒个件次位只层星辰费])/g, '$1$2'));
}

function prepDesc(text) {
  return descPrepared(text).plain;
}

/* 需要着色的区间：成对标记 + 兼容旧写法「新增：…」到下一个分句符。
   s 是剥离标记后的纯文本，known 是同一份纯文本上由成对标记解析出的区间；
   s 里已经没有【新增】，必须靠 known 判断「（新增）」是否已被成对标记覆盖 */
function newSpans(s, known) {
  const out = (known || parseMarks(s).spans).map(sp => [sp[0], sp[1]]);
  /* 「…获得攻击力且【新增】临时等级+1」：承接新增内容的「且 / 并 / 还 /
     同时」也属于新增，区间向前扩展，读者一眼能看到新增从连词开始 */
  out.forEach(sp => {
    const head = s.slice(Math.max(0, sp[0] - 2), sp[0]);
    const m = head.match(/(?:同时|并且|且|并|还)$/);
    if (m) sp[0] -= m[0].length;
  });
  const re = /新增[：:]/g;
  let m;
  while ((m = re.exec(s))) {
    let end = s.length;
    for (let i = m.index + m[0].length; i < s.length; i++) {
      if ('；;。\n'.indexOf(s[i]) >= 0) { end = i; break; }
    }
    out.push([m.index, end]);
  }
  /* 只写了可见标签「（新增）」、漏了成对标记时兜底：
     新增的是一句括号说明（「持续5秒（不可叠加）（新增）」）就从括号本身开始，
     否则从最近的「且 / 并 / 同时 / 还」或分句符之后开始着色到「（新增）」末尾；
     连词本身属于新增，要包含进来 */
  const reTag = /（新增）/g;
  while ((m = reTag.exec(s))) {
    if (out.some(sp => m.index >= sp[0] && m.index < sp[1])) continue;
    let start = 0;
    const noteM = /（[^（）]{1,60}）$/.exec(s.slice(0, m.index));
    if (noteM) {
      start = m.index - noteM[0].length;
    } else {
      for (let i = m.index - 1; i >= 0; i--) {
        if ('；;。，,、：:\n'.indexOf(s[i]) >= 0) { start = i + 1; break; }
        if (s.startsWith('同时', i)) { start = i; break; }
        if ('且并还'.indexOf(s[i]) >= 0) { start = i; break; }
      }
    }
    while (start < m.index && /\s/.test(s[start])) start++;
    out.push([start, m.index + m[0].length]);
  }
  return out;
}

/* 换行后的每行 → 在原文中的下标区间（wrapText 的行都是原文的连续片段） */
function lineRanges(s, lines) {
  const out = [];
  let pos = 0;
  lines.forEach(l => {
    if (!l) { out.push([pos, pos]); return; }
    let i = s.indexOf(l, pos);
    if (i < 0) { out.push([-1, -1]); return; }
    pos = i + l.length;
    out.push([i, pos]);
  });
  return out;
}

/* 说明文字按「新增」/【改】数值标记绘制，换行结果与 wrapText 完全一致。
   数值标记可再垫一层底色（valBg），先铺背景再写字，避免遮住相邻文字 */
function drawDescLines(ctx, lines, text, x, y, lh, base, hi, val, valBg) {
  const pr = descPrepared(text);
  const src = pr.plain;
  const spans = newSpans(src, pr.spans);
  const vals = pr.vals;
  const cVal = val || hi;
  const rgs = lineRanges(src, lines);
  const fsz = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  const fs = fsz ? parseFloat(fsz[1]) : Math.round(lh * 0.65);
  lines.forEach((l, n) => {
    const rg = rgs[n];
    const mark = rg[0] >= 0 && (spans.length || vals.length);
    if (l) {
      if (!mark) {
        ctx.fillStyle = base;
        ctx.fillText(l, x, y);
      } else {
        /* 先按「颜色 + 是否数值」切段 */
        const runs = [];
        let run = '', cur = null, curVal = false;
        for (let k = 0; k < l.length; k++) {
          const gi = rg[0] + k;
          let col = spans.some(sp => gi >= sp[0] && gi < sp[1]) ? hi : base;
          const isVal = vals.some(v => gi >= v[0] && gi < v[1]);
          if (isVal) col = cVal;
          if (cur === null) { cur = col; curVal = isVal; run = l[k]; }
          else if (col === cur && isVal === curVal) run += l[k];
          else {
            runs.push({ t: run, c: cur, v: curVal });
            cur = col; curVal = isVal; run = l[k];
          }
        }
        if (run) runs.push({ t: run, c: cur, v: curVal });

        /* 数值段垫底色（左右各留一点内边距） */
        if (valBg) {
          const px = fs * 0.10, py = fs * 0.10, bh = fs * 1.18, br = fs * 0.26;
          let bx = x;
          runs.forEach(r => {
            const w = ctx.measureText(r.t).width;
            if (r.v) {
              ctx.fillStyle = valBg;
              rr(ctx, bx - px, y - py, w + px * 2, bh, br);
              ctx.fill();
            }
            bx += w;
          });
        }

        /* 再写字 */
        let cx = x;
        runs.forEach(r => {
          ctx.fillStyle = r.c;
          ctx.fillText(r.t, cx, y);
          cx += ctx.measureText(r.t).width;
        });
      }
    }
    y += lh;
  });
  return y;
}

/* 把条目按列数排成行：每行高度取该行最高块 */
function layoutGrid(items, cols, colW, measure) {
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const cells = items.slice(i, i + cols).map((it, k) => ({ it, idx: i + k, h: measure(it, colW) }));
    rows.push({ cells, h: Math.max(...cells.map(c => c.h)) });
  }
  return rows;
}
