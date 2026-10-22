/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
function buildDescRaw(lines, verbatim) {
  if (!lines.length) return '';
  const preIdx = [];
  lines.forEach((l, i) => { if (/^调整前/.test(l)) preIdx.push(i); });

  /* 全原文模式没有调整前/后时，原样逐行照抄：少合并、少猜测，
     编号行和「模式：」这类小标题都保留自己的行。
     原文手写的箭头（「2.23秒→1.2秒」「0/40->10/40」）只统一成「 → 」，
     和压缩出来的箭头写法一致，不改任何文字 */
  if (verbatim && !preIdx.length) {
    return lines.map(s => String(s).trim())
      .filter(Boolean)
      .map(s => s.replace(/[；;]\s*$/, '').replace(/\s*(?:→|->)\s*/g, ' → '))
      /* 原文用「新增：…」说明整条都是新加的：和压缩模式一样标成新增色 */
      .map(s => {
        if (!/^新增[：:]\s*/.test(s)) return s;
        const body = s.replace(/^新增[：:]\s*/, '');
        if (!body) return '';
        return '【新增】' + body.replace(/[。！？]$/, '') + '（新增）【/新增】。';
      })
      .join('\n');
  }

  const plain = () => {
    const rawParts = lines.map(s => String(s).trim()).filter(Boolean);
    /* 原文逐行成句（行末带 。！？）的，保留句末标点，避免压缩后标点和原文不一致
       （蔷薇加码、王中王中王、竞猜池）；行末分号只是并列分隔，去掉后统一用「；」 */
    const parts = rawParts.map(s =>
      /[。！？]$/.test(s) ? s : s.replace(/[；;。]\s*$/, '')
    ).filter(Boolean);
    if (!parts.length) return '';
    let body;
    if (parts.length > 1) {
      /* 首行是「梦幻引擎」这类短标签时要用冒号引出说明；
         用分号会读成两个并列的动作（「梦幻引擎；刷新…」） */
      const head = parts[0];
      /* 编号行（「1.优化了部分称号的描述」）不是标签，用冒号会读成
         「1.优化…：2.参与…」这种断不开的长句 */
      const isLabel = head.length <= 12 &&
        !/^[0-9]+[.、．]/.test(head) &&
        !/^[（(][0-9一二三四五六七八九十]+[）)]/.test(head) &&
        !/[。！？；，、：:（）()【】「」《》→]/.test(head);
      /* 标签后每条都是完整句子：原文就是逐行列举，保留换行和句号，
         不要压成「；」连成一段（庄小鱼的三条改动）；编号行同样逐行保留。
         标签行本身不带句号，判断时只看标签之后的正文行 */
      const bodyLines = isLabel ? rawParts.slice(1) : rawParts;
      const sentenceLines = bodyLines.length >= 2 &&
        bodyLines.every(s => /[。！？]$/.test(s));
      if (sentenceLines) {
        const rows = bodyLines
          .map(s => s.replace(/^[0-9]{1,2}[.、．](?![0-9])\s*/, '').trim());
        body = isLabel ? head + '：' + rows.join('\n') : rows.join('\n');
      } else {
        body = isLabel
          ? head + '：' + parts[1] + (parts.length > 2 ? '；' + parts.slice(2).join('；') : '')
          : parts.join('；');
      }
    } else {
      body = parts[0];
    }
    body = body
      /* 原文常是「活动说明：」单独一行接「1.…」，拼接后会多出「：；」 */
      .replace(/[：:]\s*；/g, m => m.replace('；', ''))
      /* 原文里手写的箭头（「2.23秒→1.2秒」）补齐空格，与压缩生成的箭头保持一致 */
      .replace(/\s*→\s*/g, ' → ')
      .replace(/(?:。\s*){2,}/g, '。')
      .replace(/[；;]\s*。/g, '。')
      /* 编号句保留了句号，后面若还接着并列分句，分号会被读成同一句 */
      .replace(/([。！？])\s*；/g, '$1')
      .replace(/[：:]\s*$/, '')
      .replace(/[；;。]\s*$/, '');
    /* 原文用「新增：…」说明整条都是新加的：改成句末「（新增）」，
       和「原有效果且新增效果（新增）」的读法一致，也比句首冒号更显眼 */
    if (/^新增[：:]\s*/.test(body)) {
      body = body.replace(/^新增[：:]\s*/, '');
      return body ? '【新增】' + body + '（新增）【/新增】' + (/[。！？]$/.test(body) ? '' : '。') : '';
    }
    /* 以「）】【」结尾的句子同样是完整一句，必须补句号 */
    return body ? body + (/[。！？]$/.test(body) ? '' : '。') : '';
  };

  /* 同一段里有多档（如「基础技能 … 10级 …」）：每档单独一行 */
  if (preIdx.length > 1) {
    const cuts = [0];
    preIdx.slice(1).forEach(bi => {
      /* 「调整后」紧挨着下一档的「调整前」时，切点必须在它后面，否则上一档丢调整后；
         只有中间隔了档位标签（如「10级」）才把标签留给下一档 */
      const prevLine = lines[bi - 1] || '';
      const isLabel = prevLine && !/^调整[前后]/.test(prevLine) &&
        !/[。；;，,、]$/.test(prevLine) && prevLine.length <= 14;
      const cut = isLabel ? bi - 1 : bi;
      if (cut > cuts[cuts.length - 1]) cuts.push(cut);
    });
    cuts.push(lines.length);
    const segs = [];
    for (let k = 0; k < cuts.length - 1; k++) {
      const seg = lines.slice(cuts[k], cuts[k + 1]);
      const bi = seg.findIndex(s => /^调整前/.test(s));
      if (bi < 0) continue;
      const ai = seg.findIndex((s, i) => i > bi && /^调整后/.test(s));
      /* 只有调整前、没有调整后：保留原文，不能整档丢掉 */
      if (ai < 0) {
        const head = seg.slice(0, bi).map(s => s.replace(/[；;。\s]+$/, '')).filter(Boolean)
          .join('；').replace(/[：:]$/, '');
        const body = seg.slice(bi).map(s => stripAdjust(s.replace(/[；;。]\s*$/, ''))).filter(Boolean).join('；');
        if (body) segs.push(head ? head + '：' + body + '。' : body + '。');
        continue;
      }
      const sb = seg.slice(bi, ai), sa = seg.slice(ai);
      const sentenceLines = isSentenceLines(rawSideLines(sb), rawSideLines(sa));
      segs.push(verbatim
        ? arrowVerbatim(seg.slice(0, bi), sb, sa)
        : (composeLabeled(
          seg.slice(0, bi),
          sb.map(stripAdjust).filter(Boolean),
          sa.map(stripAdjust).filter(Boolean)
        ) || composeDesc(
          seg.slice(0, bi),
          sb.map(stripAdjust).filter(Boolean),
          sa.map(stripAdjust).filter(Boolean),
          { sentenceLines }
        )));
    }
    if (segs.length) return segs.join('\n');
  }

  if (!preIdx.length) return plain();
  const bi = preIdx[0];
  const ai = lines.findIndex((s, i) => i > bi && /^调整后/.test(s));
  if (ai < 0) return plain();
  const sb = lines.slice(bi, ai), sa = lines.slice(ai);
  const sentenceLines = isSentenceLines(rawSideLines(sb), rawSideLines(sa));
  if (verbatim) return arrowVerbatim(lines.slice(0, bi), sb, sa);
  return composeLabeled(lines.slice(0, bi), sb.map(stripAdjust).filter(Boolean), sa.map(stripAdjust).filter(Boolean)) ||
    composeDesc(lines.slice(0, bi), sb.map(stripAdjust).filter(Boolean), sa.map(stripAdjust).filter(Boolean), { sentenceLines });
}

/* 原文用「1./2./3.」分条：编号不是内容，去掉后每条单独一行。
   数字后面必须不是数字，避免把「1.5倍」「2.23秒」当成编号 */
function splitNumberedRules(s) {
  const re = /(^|[；;。：:\n])\s*([0-9]{1,2})[.、．](?![0-9])\s*/g;
  if ((String(s).match(re) || []).length < 2) return s;
  /* 编号前的标点是上一条的句末标点，换行时原样保留；
     原文逐条列举用「；」收尾的，拆行后每条都要带着分号，否则读起来像被截断 */
  return String(s).replace(re, (m, sep) => {
    if (sep === '\n') return '\n';
    if (/[；;。]/.test(sep)) return sep + '\n';
    /* 冒号后原本就换行的（「内容迭代：」+ 编号列表）保持换行，不能把编号列表粘回标题行 */
    return sep + (/\n/.test(m) ? '\n' : '');
  });
}

/* 活动类长段落里「入口 / 时间 / 兑换 / 说明 / 注」各自成行，避免一长串分号读不清 */
function splitActivityLines(s) {
  return String(s).replace(
    /[；;]\s*(?=(?:活动入口|祈愿时间|兑换时间|兑换说明|活动时间|活动说明|注)[：:])/g,
    '\n'
  );
}

/* ———【改】标记：只标「真正变化」的数值 ———
   判断依据是「调整前/调整后」两侧原文的数值对比，不靠出图端猜：
   · 两侧都出现过的同一数值 = 没变（暴君「100%暴击率」、安琪拉「每0.1秒」）；
   · 只在一侧出现的 = 变了，被删掉的也算（「2/3/4/5 → 2/3/4」里的 5）；
   · 用「/」「、」串起来的数组整串标，两侧都标（「2/3/4/5 → 2/3/4」全标）；
   · 【新增】区间里的数字是新加的，不标。 */
const VAL_OPEN = '【改】';
const VAL_CLOSE = '【/改】';
const VAL_NUM_SRC = '[0-9]+(?:\\.[0-9]+)?%?';
/* 「1~2阶」这种波浪号区间也当成一个整体：拆成 1 和 2 两个值会让右侧原文里的
   「1~2阶英雄」撞上左侧要标的 2，把真变化判成没变（限制性进化「获得2 → 3张」） */
const VAL_ARR_SRC = VAL_NUM_SRC + '(?:[\\/、~～]' + VAL_NUM_SRC + ')+';
/* 数字带上紧跟的量词/单位一起比较：「2张 → 3张」能对上，「10级」这种档位标签
   两侧写法一致也不会被误伤（只比数字本身时，右侧别处的 2 会把左侧的「2张」当成没变）。
   紧跟着「+」的记成「100+」：复合值「100+150%」里的 100 和另一侧的「100点」是同一个值 */
const VAL_UNIT = '张枚名点级阶秒个件次位只层星辰费倍元钻米格波';
const valKey = (tok, next) => tok + (next === '+' || next === '＋' ? '+'
  : (next && VAL_UNIT.indexOf(next) >= 0 ? next : ''));
/* 两侧比一个数：单位写法不同但值没变的不算变化（「100点」↔ 复合值里的「100+」）。
   只给「自己带量词」或「自己是复合值」的开口子，光秃秃的「2」不和「2阶」认亲，
   「100%」也不和「100+」认亲（百分比和固定值是两回事） */
function numHit(set, key, isComp) {
  if (set.has(key)) return true;
  const bare = (key.match(/^[0-9]+(?:\.[0-9]+)?/) || [key])[0];
  if (isComp) {
    for (const k of set) {
      const tail = k.slice(bare.length);
      if (k !== bare && k.slice(0, bare.length) === bare && tail.length === 1
        && VAL_UNIT.indexOf(tail) >= 0) return true;
    }
    return false;
  }
  const tail = key.slice(bare.length);
  return tail.length === 1 && VAL_UNIT.indexOf(tail) >= 0 && set.has(bare + '+');
}
function descNums(s) {
  const out = new Set();
  /* 数组已由 descArrs 单独判定，先挖掉，避免数组里的成员干扰单个数字的比较 */
  const text = String(s).replace(new RegExp(VAL_ARR_SRC, 'g'), ' ');
  const re = new RegExp(VAL_NUM_SRC, 'g');
  let m;
  while ((m = re.exec(text))) out.add(valKey(m[0], text[m.index + m[0].length] || ''));
  return out;
}
function descArrs(s) {
  return new Set(String(s).match(new RegExp(VAL_ARR_SRC, 'g')) || []);
}
function markChangedVals(text, lines) {
  let t = String(text || '');
  if (!t) return t;
  /* 重复跑时先清掉上一次的标记，避免套娃 */
  t = t.split(VAL_OPEN).join('').split(VAL_CLOSE).join('');
  /* 整句两版的大改写（bigRewrite）：两侧照抄，哪个数都不算「改」，
     记下区间，区间里的数字一律不标金 */
  const bigs = [];
  for (let bi = 0; bi >= 0;) {
    bi = t.indexOf(BIG_OPEN, bi);
    if (bi < 0) break;
    const bc = t.indexOf(BIG_CLOSE, bi);
    if (bc < 0) break;
    bigs.push([bi, bc + BIG_CLOSE.length]);
    bi = bc + BIG_CLOSE.length;
  }
  const inBig = p => bigs.some(r => p >= r[0] && p < r[1]);
  const src = (lines || []).map(s => String(s));
  const pIdx = [];
  src.forEach((s, i) => { if (/^调整前/.test(s)) pIdx.push(i); });
  const pairs = [];
  for (let k = 0; k < pIdx.length; k++) {
    const p = pIdx[k];
    const next = k + 1 < pIdx.length ? pIdx[k + 1] : src.length;
    let a = -1;
    for (let i = p + 1; i < next; i++) if (/^调整后/.test(src[i])) { a = i; break; }
    if (a < 0) continue;
    /* 下一档的档位标签（「10级」）不属于本档的调整后，算进去会把档位数字当成变化 */
    let end = next;
    if (k + 1 < pIdx.length && next - 1 > a) {
      const lb = src[next - 1];
      if (!/[。；;，,、]$/.test(lb) && lb.length <= 14) end = next - 1;
    }
    pairs.push([src.slice(p, a).join(''), src.slice(a, end).join('')]);
  }
  if (!pairs.length) {
    /* 原文自己写着「由 7点 降低至 5点」这类增减说法（没有调整前/调整后）：
       两个数字都算变化，其余原样返回 */
    const cmpAt = [];
    const cmpRe = new RegExp('(?:由|从)?\\s*(' + VAL_NUM_SRC + ')([^，。；]{0,8}?)(降低至|降低到|下调至|提升至|提高至|上调至|增加至|增至|调整为|改为|变为|变成)\\s*(' + VAL_NUM_SRC + ')', 'g');
    let cm;
    while ((cm = cmpRe.exec(t))) {
      const i1 = cm.index + cm[0].indexOf(cm[1]);
      const i2 = cm.index + cm[0].length - cm[4].length;
      cmpAt.push([i1, i1 + cm[1].length], [i2, i2 + cm[4].length]);
    }
    if (cmpAt.length) {
      let out0 = '', last0 = 0, m0;
      const re0 = new RegExp(VAL_NUM_SRC, 'g');
      while ((m0 = re0.exec(t))) {
        const p = m0.index;
        if (!cmpAt.some(r => p >= r[0] && p < r[1])) continue;
        out0 += t.slice(last0, p) + VAL_OPEN + m0[0] + VAL_CLOSE;
        last0 = p + m0[0].length;
      }
      return (out0 + t.slice(last0)).split('\uE000').join('').split('\uE001').join('')
        .split(BIG_OPEN).join('').split(BIG_CLOSE).join('');
    }
    /* 原文既没有「调整前/调整后」、也没有「由…降低至…」，只写了「能量消耗：8 → 6」：
       箭头两侧本身就是两版，继续往下按箭头比较 */
  }
  const lTxt = pairs.map(x => x[0]).join('\n');
  const rTxt = pairs.map(x => x[1]).join('\n');
  const lNum = pairs.length ? descNums(lTxt) : new Set();
  const rNum = pairs.length ? descNums(rTxt) : new Set();
  const lArr = pairs.length ? descArrs(lTxt) : new Set();
  const rArr = pairs.length ? descArrs(rTxt) : new Set();
  /* 左段数值是不是「被压缩省略的共有内容」，只查它对应的那个分句的调整后原文。
     查整段调整后会把别的分句里的同值算进来：海诺神杖的 150% 撞上子杖还写着的
     150%，于是被判成没变。两侧分句数一致时按分句配对，否则退回整档 */
  const ctxs = [];
  pairs.forEach(([b, a]) => {
    const bs = splitClauses(b), as = splitClauses(a);
    if (bs.length && bs.length === as.length) {
      const map = alignClauses(bs, as);
      bs.forEach((x, i) => ctxs.push({ l: x, r: as[map[i]] }));
    } else {
      ctxs.push({ l: b, r: a });
    }
  });
  const ctxRight = segTxt => {
    let best = null, bestSc = 0;
    ctxs.forEach(c => {
      const sc = clauseSim(segTxt, c.l);
      if (sc > bestSc) { bestSc = sc; best = c; }
    });
    return bestSc >= 0.5 ? best.r : null;
  };
  /* 箭头右侧的分句要找的是同一对里的「调整前」，拿调整后的自己比永远相等 */
  const ctxLeft = segTxt => {
    let best = null, bestSc = 0;
    ctxs.forEach(c => {
      const sc = clauseSim(segTxt, c.r);
      if (sc > bestSc) { bestSc = sc; best = c; }
    });
    return bestSc >= 0.5 ? best.l : null;
  };
  if (t.indexOf('→') < 0) return t.split(BIG_OPEN).join('').split(BIG_CLOSE).join('');
  /* 箭头两侧各自划段比较：默认只跟紧挨箭头的那一个分句比，避免同一句里别处
     出现过的同值把标记吃掉（海诺「150+150% → 100+200%」里的 100）。
     一个箭头横跨多个分句时（「A；B → A'；B'」）只比相邻分句会拿错参照，
     于是右侧没变的数值被当成新增（香香「每拥有1名不低于10级的4-5阶英雄，
     攻击力+30 → 每拥有1名4-5阶英雄，攻击力+20」）：这时把两侧各自切开，
     按内容相似度一一配对，配对不成才退回相邻分句 */
  const segs = [];
  /* 紧挨箭头的数值段：左侧取末尾、右侧取开头，中间可以夹「+」（30+100%）。
     一条里有多个箭头时只看这一小段，否则左段会把下一个箭头的旧值包进来 */
  const trailRun = (s0, s1) => {
    const raw = t.slice(s0, s1), s = raw.replace(/\s+$/, '');
    const m = /(?:[0-9]+(?:\.[0-9]+)?[%％]?\+)*[0-9]+(?:\.[0-9]+)?[%％]?$/.exec(s);
    if (!m || !m[0]) return null;
    return { a: s0 + m.index, b: s0 + m.index + m[0].length };
  };
  const leadRun = (s0, s1) => {
    const raw = t.slice(s0, s1), s = raw.replace(/^\s+/, '');
    const m = /^(?:[0-9]+(?:\.[0-9]+)?[%％]?\+)*[0-9]+(?:\.[0-9]+)?[%％]?/.exec(s);
    if (!m || !m[0]) return null;
    return { a: s0 + (raw.length - s.length), b: s0 + (raw.length - s.length) + m[0].length };
  };
  const pushPair = (la, lb, ra, rb) => {
    const lineTxt = t.slice(lineStart(lb), lineEnd(lb));
    const multi = lineTxt.indexOf('→') !== lineTxt.lastIndexOf('→');
    /* 就地改写的行（整句只写一遍、箭头两边只放新值）：箭头旁边就是变化的那一小段，
       后面的共用文字（「…（至少1级）」）不属于右侧新值，不能拿来比 */
    const inline = /[\uE000\uE001]/.test(lineTxt);
    if ((multi || inline) && !/[\/、]/.test(t.slice(la, rb))) {
      const lr0 = trailRun(la, lb), rr0 = leadRun(ra, rb);
      if (lr0) { la = lr0.a; lb = lr0.b; }
      if (rr0) { ra = rr0.a; rb = rr0.b; }
    }
    const lt = t.slice(la, lb), rt = t.slice(ra, rb);
    const lr = ctxRight(lt);
    const ln = descNums(lt), lr2 = descArrs(lt), rn = descNums(rt), rr2 = descArrs(rt);
    segs.push({ a: la, b: lb, side: 'L', num: ln, arr: lr2, otherNum: rn, otherArr: rr2,
      afterNum: lr === null ? rn : descNums(lr), afterArr: lr === null ? rr2 : descArrs(lr) });
    segs.push({ a: ra, b: rb, side: 'R', num: rn, arr: rr2, otherNum: ln, otherArr: lr2,
      afterNum: null, afterArr: null });
  };
  const lineStart = p => { let i = p; while (i > 0 && !/[。！？\n]/.test(t[i - 1])) i--; return i; };
  const lineEnd = p => { let i = p; while (i < t.length && !/[。！？\n]/.test(t[i])) i++; return i; };
  /* 把一段原文按逗号/分号切成小分句，返回字符区间；括号里的标点不切 */
  const spans = (s0, s1) => {
    const out = [];
    let st = s0, depth = 0;
    for (let i = s0; i < s1; i++) {
      const ch = t[i];
      if (OPEN_BR.includes(ch)) depth++;
      else if (CLOSE_BR.includes(ch) && depth) depth--;
      else if (!depth && /[，；]/.test(ch)) { if (t.slice(st, i).trim()) out.push({ a: st, b: i }); st = i + 1; }
    }
    if (t.slice(st, s1).trim()) out.push({ a: st, b: s1 });
    return out;
  };
  const arRe = /→/g;
  let am;
  while ((am = arRe.exec(t))) {
    const ap = am.index;
    const l0 = lineStart(ap), r0 = lineEnd(ap);
    let done = false;
    /* 整条里只有一个箭头，才可能是一个跨分句的箭头 */
    if (t.slice(l0, r0).split('→').length === 2) {
      const lc = spans(l0, ap), rc = spans(ap + 1, r0);
      if (lc.length >= 2 && lc.length === rc.length) {
        const lts = lc.map(x => t.slice(x.a, x.b));
        const rts = rc.map(x => t.slice(x.a, x.b));
        const map = alignClauses(lts, rts);
        /* 至少有一对分句高度相似，才认定两侧是并列结构，否则宁可退回相邻分句 */
        if (lts.some((x, i) => clauseSim(x, rts[map[i]]) >= 0.7)) {
          lc.forEach((x, i) => pushPair(x.a, x.b, rc[map[i]].a, rc[map[i]].b));
          done = true;
        }
      }
    }
    if (!done) {
      /* 一条里出现多个箭头时（就地标变化），分段要停在箭头处，
         否则左段会把下一个箭头的旧值也包进来，那个旧值就被当成没变 */
      let ls = ap;
      while (ls > 0 && !/[，；。：→]/.test(t[ls - 1])) ls--;
      let re2 = ap + 1;
      while (re2 < t.length && !/[，；。：→]/.test(t[re2])) re2++;
      pushPair(ls, ap, ap + 1, re2);
    }
  }
  const segAt = pos => {
    for (let k = 0; k < segs.length; k++) if (pos >= segs[k].a && pos < segs[k].b) return segs[k];
    return null;
  };
  /* 把整段压缩后的文本切成小分句（括号里的标点不切），给落在箭头分段之外的
     数字找「它自己这句话」 */
  const clauses = [];
  {
    let st = 0, depth = 0;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (OPEN_BR.includes(ch)) depth++;
      else if (CLOSE_BR.includes(ch) && depth) depth--;
      else if (!depth && /[，；。！？\n]/.test(ch)) {
        if (t.slice(st, i).trim()) clauses.push({ a: st, b: i });
        st = i + 1;
      }
    }
    if (t.slice(st).trim()) clauses.push({ a: st, b: t.length });
  }
  const clauseAt = pos => {
    for (let k = 0; k < clauses.length; k++) {
      if (pos >= clauses[k].a && pos < clauses[k].b) return t.slice(clauses[k].a, clauses[k].b);
    }
    return '';
  };
  /* 数字在箭头的哪一侧：往前找最近的换行（左）或箭头（右） */
  const sideAt = pos => {
    for (let i = pos - 1; i >= 0; i--) {
      const ch = t[i];
      if (ch === '\n') return 'L';
      if (ch === '→') return 'R';
    }
    return 'L';
  };
  /* 【新增】区间里的数字是新加的，不按「变化」标色 */
  const NEW_O = '【新增】', NEW_C = '【/新增】';
  const nov = [];
  let oi = 0;
  while ((oi = t.indexOf(NEW_O, oi)) >= 0) {
    const c = t.indexOf(NEW_C, oi);
    if (c < 0) { nov.push([oi, t.length]); break; }
    nov.push([oi, c + NEW_C.length]);
    oi = c + NEW_C.length;
  }
  const inNew = p => nov.some(r => p >= r[0] && p < r[1]);
  const marks = [];
  const re = new RegExp(VAL_ARR_SRC + '|' + VAL_NUM_SRC, 'g');
  let m;
  while ((m = re.exec(t))) {
    const tok = m[0], pos = m.index;
    const isArr = /[\/、~～]/.test(tok);
    const key = isArr ? tok : valKey(tok, t[pos + tok.length] || '');
    const isComp = !isArr && /^[+＋]/.test(t[pos + tok.length] || '');
    let mark = false;
    /* 「40级：」「100级：」「10级技能：」是档位标签，不是数值，
       跨分句配对时别把它当成变化 */
    if (!inBig(pos) && !inNew(pos) && !/^\s*级[^\n。，；]{0,6}[：:]/.test(t.slice(pos + tok.length))) {
      const sg = segAt(pos);
      if (sg && sg.otherNum) {
        /* 左段的数字：右侧同一箭头里也写了、或它对应的那句调整后原文里本来就有
           （被压缩省略的共有内容，如暴君「200%攻速、100%暴击率并无敌 → 70%伤害减免」）→ 不算变化。
           右侧同理：两侧共有的句尾只写一次、落在箭头后面时，左段里就没有它，
           回「调整前」原文那一句里查一次（西施「…并眩晕周围的敌方单位2秒」两侧都没变） */
        const hit = x => (isArr ? x.has(tok) : numHit(x, key, isComp));
        const coR = (sg.side === 'R' && ctxs.length) ? ctxLeft(clauseAt(pos)) : null;
        /* 「10级：」这种档位标签不是数值，别拿它当「左侧本来就有这个数」 */
        const after = sg.side === 'R'
          ? (coR === null ? null
            : (isArr ? descArrs(coR) : descNums(coR.replace(/[0-9]+级[^0-9。，；]{0,6}[：:]/g, ''))))
          : (isArr ? (sg.afterArr || rArr) : (sg.afterNum || rNum));
        mark = !hit(isArr ? sg.otherArr : sg.otherNum) && !(after && hit(after));
      } else {
        /* 数字落在箭头分段之外（箭头所在的分句和这个数字不在同一句，
           蒙犽「每枚造成30+100%…。多枚导弹… → 多枚导弹…」）：左侧找它
           自己这句话对应的调整后原文、右侧找调整前，再比。拿整档文本比会被
           别处写着的同值吃掉，10级：30+100% 会把主技能的 100% 判成没变 */
        const cl = clauseAt(pos);
        const co = ctxs.length
          ? (sideAt(pos) === 'R' ? ctxLeft(cl) : ctxRight(cl))
          : null;
        if (co !== null) {
          mark = isArr ? !descArrs(co).has(tok) : !numHit(descNums(co), key, isComp);
        } else {
          mark = isArr ? lArr.has(tok) !== rArr.has(tok)
            : numHit(lNum, key, isComp) !== numHit(rNum, key, isComp);
        }
      }
    }
    if (mark) marks.push({ a: pos, b: pos + tok.length });
  }
  /* 数字标记合并输出：紧挨的并成一段 */
  marks.sort((x, y) => x.a - y.a);
  const merged = [];
  marks.forEach(r => {
    const prev = merged[merged.length - 1];
    if (prev && r.a <= prev.b) prev.b = Math.max(prev.b, r.b);
    else merged.push({ a: r.a, b: r.b });
  });
  let out = '', last = 0;
  merged.forEach(r => {
    if (r.a < last) return;
    out += t.slice(last, r.a) + VAL_OPEN + t.slice(r.a, r.b) + VAL_CLOSE;
    last = r.b;
  });
  return (out + t.slice(last)).split('\uE000').join('').split('\uE001').join('')
    .split(BIG_OPEN).join('').split(BIG_CLOSE).join('');
}

function buildDesc(lines, verbatim) {
  /* 局外章节：公告原文原样照抄，不合并、不压箭头、不补标点、不标金 */
  if (verbatim === 'plain') {
    return lines.map(s => String(s).trim()).filter(Boolean).join('\n');
  }
  let out = splitNumberedRules(splitActivityLines(buildDescRaw(lines, verbatim)));
  if (verbatim) {
    /* 全原文照抄时，编号小标题（2.战术特性 / 3.武器特性）另起一行，不跟在分号后面 */
    out = out.replace(/；\s*(?=[0-9]{1,2}[.、．])/g, '\n');
    /* 压缩算法已经标好「【新增】…（新增）【/新增】」的，别再按「（新增）」整行重标一遍
       （光棱塔会把前半句也吞进新增区间） */
    if (out.indexOf('【新增】') < 0) out = markLiteralNew(out);
  }
  return markChangedVals(out, lines);
}

/* 三级标签：整行加粗，且以「调整 / 更新 / 修复 / 说明」结尾 */
const SUB_RE = /(调整|更新|修复|说明)$/;
/* 分类小标题：原文即使漏了加粗，也仍然是三级标签，不能并进正文 */
const SUB_LABEL_RE = /^(英雄技能调整|卡牌效果调整|对局选人方式调整|受击回蓝调整)$/;
/* 问题修复列表里，以这些动词开头的行是新的一条，不能粘到上一条末尾 */
const FIX_VERB_RE = /^(修复|优化|调整|新增|删除|移除|修正|修改|解决|改善|更换|替换|更新|补充|完善|统一|提高|降低|增加|减少|缩短|延长)/;
/* 档位 / 属性标签（基础技能、10级、10级技能、攻击力…）：属于上一条英雄的说明，不能单独成条目 */
const TIER_LABEL_RE = /^(基础技能|技能|被动|技能前摇|技能后摇|[0-9]+级(?:技能|被动|普攻|主动|大招|奥义|效果|伤害)?|.{0,8}(攻击速度|攻击力|生命值|法力值|护盾|技能范围|冷却|消耗))$/;
/* 属性小标题（技能：/秘技：/专属：…）：属于上一条棋手的正文，不单独占一级 */
const ATTR_HEAD_RE = /^(技能|秘技|专属|被动|主动|奥义|绝技|觉醒|连携)[：:]/;
function isSubLabel(lines, i) {
  const l = lines[i];
  const t = l.text.trim();
  if (!t || t.length > 14) return false;
  /* 这类分类名本身就是小标题：不依赖加粗，也不要求同一段里还有下一行，
     原文经常把它单独放在一个 <p> 里 */
  if (SUB_LABEL_RE.test(t)) return true;
  if (i >= lines.length - 1) return false;
  if (!l.bold) return false;
  if (/[。！？；：，、]$/.test(t)) return false;
  return SUB_RE.test(t);
}

