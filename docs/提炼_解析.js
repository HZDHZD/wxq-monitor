/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* ====================  解析  ==================== */
/* 「改动前 / 改动后」「修改前 / 修改后」与「调整前 / 调整后」同义，统一成后者。
   只认行首标签（后面紧跟冒号或整行结束），避免把「改动前摇」这类正文改坏 */
const ADJ_ALIAS_RE = /^(?:改动|修改)([前后])(?=[：:]|\s*$)/;
function normAdjLabel(s) { return String(s || '').replace(ADJ_ALIAS_RE, '调整$1'); }

function linesOf(p) {
  const raw = [];
  (function walk(node, bold) {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) raw.push({ t: ch.nodeValue, b: bold });
      else if (ch.nodeName === 'BR') { raw.push({ br: true }); }
      else if (ch.nodeName === 'STRONG' || ch.nodeName === 'B') walk(ch, true);
      else if (ch.nodeName === 'IMG') { /* 图片忽略 */ }
      else walk(ch, bold);
    }
  })(p, false);

  const out = [];
  let segs = [];
  const pushLine = () => {
    const text = clean(segs.map(s => s.t).join(''));
    const bold = clean(segs.filter(s => s.b).map(s => s.t).join(''));
    /* 「改动前 / 改动后」和「调整前 / 调整后」是同一个意思：统一成后者，
       后面的配对、压箭头、标金都只认一套写法 */
    if (text) out.push({ text: normAdjLabel(text), bold: normAdjLabel(bold) });
    segs = [];
  };
  raw.forEach(x => { if (x.br) pushLine(); else segs.push(x); });
  pushLine();
  return out;
}

const NOT_NAME_RE = /^(调整前|调整后|觉醒前|觉醒后|注|活动|兑换|祈愿|版本|更新)/;
/* 结构标签：「调整前 / 调整后 / 觉醒前 / 觉醒后」这类行只是上一条的对照正文，
   加粗了也不能当条目名，否则「调整后」的新内容会被拆成一张独立卡，上一条只剩旧值 */
const STRUCT_LABEL_RE = /^(调整|觉醒|改动|修改)[前后](?:[：:]|$)/;
const SHORT_RE = /^(?:[\u4e00-\u9fa5]{1,14}|[\u4e00-\u9fa5A-Za-z0-9·\-\s]{2,14})$/;
/* 允许带冒号的短名，如「技能突破：亚瑟」，否则会被误并入说明 */
const NAME_LINE_RE = /^[\u4e00-\u9fa5A-Za-z0-9·\-\s：:]{2,16}$/;
/* 天赋名的前缀：这类名字本身用冒号连接，保留官方冒号，不改间隔号 */
const TALENT_HEAD_RE = /^(技能突破|技能强化|技能|天赋|觉醒|被动|主动|奥义|绝技)$/;
/* 「新增天赋」这类整段加粗标题：其后的条目都是新增，需要补「新增：」 */
const NEW_SCOPE_RE = /^新增(天赋|英雄|卡牌|技能|装备|成就|称号|机制|系统|玩法|棋手|棋子)(调整)?$/;
/* 「天赋调整 / 英雄技能调整」这类标题：结束新增作用域；
   后面可能还跟着条目名（「天赋调整：春风化雨」），同样算标题 */
const END_SCOPE_RE = /(调整|更新|修复|说明)([：:]\s*[^：:]{1,10})?$/;
/* 「新增天赋」段里一行一条，条目名用冒号接说明（技能突破：亚瑟：… / 丢盔弃甲：…） */
const NEW_ITEM_LINE_RE = /^([^：:，。；]{2,12})[：:]\S/;
/* 原文条目的名字不一定加粗（18916493 的 蒙恬 / 亚连 / 镜 / 蒙犽 / 苍）：
   段落首行是短名字、后面还跟着正文行时，也认成条目标题。
   档位词（初始法力值 / 被动技能 / 10级）、动作句（删除 / 优化…）、
   三级标签（…调整）和带【】／括号的行都不算名字 */
const ACTION_HEAD_RE = /^(修复|优化|调整|新增|删除|移除|修正|修改|解决|改善|更换|替换|更新|补充|完善|统一|提高|降低|增加|减少|缩短|延长|上调|下调|开启|关闭)/;
const ITEM_NAME_CH_RE = /^[\u4e00-\u9fa5A-Za-z0-9·\-\s]+$/;
function looksLikeItemName(t) {
  if (!t || t.length > 14) return false;
  if (!ITEM_NAME_CH_RE.test(t)) return false;
  if (NOT_NAME_RE.test(t) || TIER_LABEL_RE.test(t) || ATTR_HEAD_RE.test(t)) return false;
  if (ACTION_HEAD_RE.test(t) || SUB_RE.test(t)) return false;
  return true;
}
/* 以「以下 / 本次」这类词开头的短句是正文引导语，不是条目名 */
const NOT_HEAD_RE = /^(以下|如下|本次|此次|上述|以上|该|此|其|相关|其他|其余|所有|全部|后续|详细|具体|同时|另外|此外)/;
/* 没加粗的短名以「调整 / 更新 / 修复 / 说明」收尾时，只在这一段后面还有正文
   的情况下才认成条目标题：「王中王匹配逻辑调整」是条目名，不是三级标签 */
function looksLikeEndingName(t) {
  const s = String(t || '').trim();
  if (!s || s.length > 14) return false;
  if (!ITEM_NAME_CH_RE.test(s)) return false;
  if (NOT_NAME_RE.test(s) || NOT_HEAD_RE.test(s)) return false;
  if (ACTION_HEAD_RE.test(s) || TIER_LABEL_RE.test(s)) return false;
  return SUB_RE.test(s);
}

/* ====================  名单词典  ==================== */
/* 用素材里的官方名单判断「这一行是不是名字」：棋手 / 棋手技能 / 英雄 / 天赋 / 效果牌 / 装备。
   比「够不够短、有没有加粗」可靠：蒙恬、闹闹、丢盔弃甲 都能直接认出来 */
const LEX_NORM_RE = /[\s·・．.：:""''「」『』（）()【】\[\]]/g;
function lexNorm(s) { return clean(s).replace(LEX_NORM_RE, ''); }
const LEX_INDEX = (() => {
  const map = new Map();
  const add = (kind, name, owner) => {
    const k = lexNorm(name);
    if (!k || map.has(k)) return;
    map.set(k, { kind, name, owner: owner || '' });
  };
  const L = (typeof window !== 'undefined' && window.LEX) || {};
  (L.lords || []).forEach(n => add('lord', n));
  (L.heroes ? Object.keys(L.heroes) : []).forEach(n => add('hero', n));
  (L.talents || []).forEach(n => add('talent', n));
  (L.effects || []).forEach(n => add('effect', n));
  (L.equips || []).forEach(n => add('equip', n));
  Object.keys(L.skills || {}).forEach(owner => (L.skills[owner] || []).forEach(n => add('skill', n, owner)));
  return map;
})();
function lexLookup(s) { return LEX_INDEX.get(lexNorm(s)) || null; }

function isStartLine(lines, i) {
  const l = lines[i];
  /* 结构标签永远不是条目名（加粗也一样）：它们是上一条的对照正文 */
  if (STRUCT_LABEL_RE.test(l.text.trim())) return false;
  if (l.bold) return true;
  if (i === 0) return true;
  const prev = lines[i - 1];
  if (prev.bold) return false;
  if (NOT_NAME_RE.test(l.text)) return false;
  if (!SHORT_RE.test(l.text)) return false;
  return /[。！？；]$/.test(prev.text);
}

function stripAdjust(s) {
  return s
    .replace(/^调整[前后][：:]?\s*/, '')
    /* 原文常把伤害类型写两遍：「造成真实伤害：25%物攻的的真实伤害」。
       箭头右侧只替换数值时，尾巴上的「的真实伤害」会重复，先去掉 */
    .replace(/([^：:；。]{2,12})[：:](.+?)的\1[。]?$/, '$1：$2')
    .replace(/[；;。]$/, '')
    .trim();
}

/* 把「调整前 / 调整后」按句对齐，逐句压成「旧 → 新」，避免多句段落被整段塞进一个箭头里 */
function splitClausesSep(s) {
  /* 逗号也是并列句的分界：廉颇「技能伤害 50+120%攻击力，护盾提升至250点」
     不切开的话，未变的护盾会被拖到箭头右侧；括号内的逗号不切 */
  const out = [];
  let buf = '', depth = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (OPEN_BR.includes(ch)) depth++;
    else if (CLOSE_BR.includes(ch) && depth) depth--;
    /* 「持续5秒。（不可叠加）」的句号不是分句点：括号说明属于同一句，
       在这里切开会让前后句数对不齐，整段只能退回整句压缩 */
    const tailBr = ch === '。' && str[i + 1] === '（';
    if (depth === 0 && /[；;。，,]/.test(ch) && !tailBr) {
      if (buf.trim()) out.push({ t: buf.trim(), sep: ch });
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push({ t: buf.trim(), sep: '' });
  return out;
}

function splitClauses(s) {
  return splitClausesSep(s).map(x => x.t);
}

/* 分句相似度：最长公共子串占短句的比例 */
function clauseSim(a, b) {
  if (!a || !b) return 0;
  let prev = new Array(b.length + 1).fill(0), best = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best / Math.min(a.length, b.length);
}

/* 调整前后分句数量相同时，按内容相似度一一配对（允许交叉）。
   公告常把同一件事换个位置重写（「…伤害60%，但无法穿透」→
   「只会命中瞄准的单位，且…伤害75%」），按位置硬配会把「无法穿透」
   和「伤害75%」配成一对，读起来完全错位。位置相同者略微优先，相似度
   持平的时候保持原文顺序 */
function alignClauses(bs, as) {
  const n = bs.length;
  const map = bs.map((_, i) => i);
  if (n < 2 || as.length !== n) return map;
  const score = bs.map((b, i) => as.map((a, j) => clauseSim(b, a) + (i === j ? 0.001 : 0)));
  const idScore = score.reduce((s, row, i) => s + row[i], 0);
  let best = map.slice(), bestScore = -1;
  if (n <= 7) {
    const used = new Array(n).fill(false), pick = new Array(n).fill(0);
    (function dfs(i, sum) {
      if (i === n) {
        if (sum > bestScore) { bestScore = sum; best = pick.slice(); }
        return;
      }
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        used[j] = true; pick[i] = j;
        dfs(i + 1, sum + score[i][j]);
        used[j] = false;
      }
    })(0, 0);
  } else {
    const cand = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cand.push([i, j, score[i][j]]);
    cand.sort((x, y) => y[2] - x[2]);
    const ub = new Array(n).fill(false), ua = new Array(n).fill(false);
    for (const c of cand) {
      if (ub[c[0]] || ua[c[1]]) continue;
      ub[c[0]] = ua[c[1]] = true;
      best[c[0]] = c[1];
    }
  }
  /* 交叉配对只在收益明显时才采用：公告两侧分句通常是同一顺序写下来的，
     相似度的微小波动会把两档数值配反（海诺「造成150+150%…」与
     「造成50+100%…」都含「造成…法术伤害」，交叉后神杖/子杖的数值互换）。
     除非交叉能让总分高出不少，否则保持原文顺序 */
  if (bestScore - idScore <= 0.6) return map;
  return best;
}

/* 按句号切句（括号内的句号不切），用于两侧句数一致、逗号分句却对不齐的段落 */
function splitSentences(s) {
  const out = [];
  let buf = '', depth = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (OPEN_BR.includes(ch)) depth++;
    else if (CLOSE_BR.includes(ch) && depth) depth--;
    buf += ch;
    if (depth === 0 && /[。！？]/.test(ch)) {
      if (buf.trim()) out.push({ t: buf.trim(), sep: ch });
      buf = '';
    }
  }
  if (buf.trim()) out.push({ t: buf.trim(), sep: '' });
  return out;
}

/* 每对分句带上原文的句末标点：原文用「。」断开的两句，压缩后仍用「。」，
   不能一律改成「；」，否则卡片上的标点和公告原文对不上 */
function pairSides(before, after) {
  const pairs = [];
  if (before.length === after.length) {
    for (let i = 0; i < before.length; i++) {
      const b = splitClausesSep(before[i]), a = splitClausesSep(after[i]);
      if (b.length && b.length === a.length) {
        const map = alignClauses(b.map(x => x.t), a.map(x => x.t));
        b.forEach((x, k) => pairs.push([x.t, a[map[k]].t, x.sep]));
      } else {
        /* 逗号切出来的分句数对不齐、两侧句数却一致时（班叔：两侧各两句，
           但左侧用逗号把条件切开、右侧没切），按句号逐句配对，
           不能把整段塞进一个箭头里 */
        const bs = splitSentences(before[i]), as = splitSentences(after[i]);
        if (bs.length > 1 && bs.length === as.length) {
          bs.forEach((x, k) => pairs.push([x.t, as[k].t, x.sep]));
        } else pairs.push([before[i], after[i], '']);
      }
    }
    return pairs;
  }
  const b = splitClauses(before.join('；')), a = splitClauses(after.join('；'));
  if (b.length && b.length === a.length) {
    const map = alignClauses(b, a);
    return b.map((x, k) => [x, a[map[k]], '']);
  }
  return null;
}

const TOKEN_RE = /[0-9A-Za-z.%×+\-\/]/;
const OPEN_BR = '（(【[「《';
const CLOSE_BR = '）)】]」》';
const QUANT_RE = /[0-9]+(?:\.[0-9]+)?[名个张枚件点种位条回合层次]?$/;
/* 判断一段话里有没有「效果」（谓语或数值变化）。只有触发条件、状语的半句
   （「施法时」「战斗中每分钟」）不能当成新增效果接在「且」后面，
   否则会读成「施法时，且获得护盾」「恢复2点生命，且战斗中每分钟」 */
const PRED_RE = /[0-9][+\-×\/]|提升|提高|降低|减少|增加|获得|恢复|造成|触发|召唤|复制|移除|摧毁|变为|变成|改为|转化为|持续|附加|施加|免疫|无视|眩晕|沉默|减速|加速|消耗|返还|抽取|选择|具有|使|令|对|将|可|能|会|无法|不再|仅|只|为|是|至/;
const hasPred = s => PRED_RE.test(s);
/* 追加内容自带触发条件（「每回合开始时，恢复2点生命」）：它是另一条规则，
   用「且」并进上一句会被读成同一触发条件下的追加 */
const TRIGGER_RE = /^(每回合|每[^，,；;。]{1,8}|每当|每次|战斗开始|战斗结束|回合开始|回合结束|施法|释放|使用|打出|登场|攻击|受到|召唤|阵亡|击杀|觉醒|当|若|如果|直到)/;
const isOwnRule = s => TRIGGER_RE.test(s) && /[，,；;]/.test(s);
/* 末尾括号只在调整后出现（米莱狄「（不可叠加）」、红莲炎甲「（生命恢复包含
   吸血效果）」）：它是调整后新增的限定/补充说明，必须标成新增，
   否则会被读成两版共有的描述 */
const markNewNote = (head, note) =>
  head.replace(/[。；\s]+$/, '') + '【新增】' + note + '（新增）【/新增】' + (/[。！？]$/.test(head) ? '。' : '');

/* 调整后省略了调整前的主语/中心词时（「狙击弹额外造成目标最大生命值60%」→
   「额外造成目标最大生命值75%」），把两版共有的那一段只写一次，读成
   「狙击弹额外造成目标最大生命值60% → 75%」；否则左右各抄一遍长名词 */
function compressOmitted(l, r) {
  if (!l || !r) return '';
  for (let k = Math.min(l.length, r.length) - 1; k >= 6; k--) {
    const s = r.slice(0, k);
    let idx = l.indexOf(s, 1);
    while (idx > 0) {
      const a = l.slice(0, idx), x = l.slice(idx + k), y = r.slice(k);
      if (a.length >= 2 && a.length <= 10 &&
        !/[0-9，,。；;：:、%（）()]/.test(a) &&
        x && y && x !== y && x.length <= 12 && y.length <= 12 && /[0-9]/.test(x + y)) {
        /* 两段差异尾巴共用的后半截（「60%的物理伤害」「75%的物理伤害」）
           只保留一次，读成「…60% → 75%的物理伤害」 */
        let xs = x, ys = y, tail = '', cs = 0;
        const mc = Math.min(xs.length, ys.length);
        while (cs < mc && xs[xs.length - 1 - cs] === ys[ys.length - 1 - cs]) cs++;
        /* 不要把「60%」这类数字+单位从中间切开 */
        while (cs > 0 && cs < mc) {
          const p = xs.length - cs;
          if (p > 0 && TOKEN_RE.test(xs[p - 1]) && TOKEN_RE.test(xs[p])) cs--;
          else break;
        }
        if (cs >= 2 && cs < mc) {
          tail = xs.slice(xs.length - cs);
          xs = xs.slice(0, xs.length - cs);
          ys = ys.slice(0, ys.length - cs);
        }
        return a + s + xs + ' → ' + ys + tail;
      }
      idx = l.indexOf(s, idx + 1);
    }
  }
  return '';
}

const CONJ_LEAD = /^(并且|并|且|同时|还|以及|和|与|及|或)/;
/* 调整后换了语序重写时，右支常以「且/并/同时」起头，而调整前对应位置没有
   承接对象（「…伤害60%，但无法穿透」→「…，且…伤害75%」）：先去掉这个连词
   再压缩，否则会压出「… → 且…」这种残句。两侧连词不同时（「100%暴击率并无敌」→
   「100%暴击率和70%伤害减免」）只保留左侧，右侧那个没有并列对象 */
function stripLeadConj(b, a) {
  const bM = b.match(CONJ_LEAD), aM = a.match(CONJ_LEAD);
  if (!aM || (bM && bM[0] === aM[0])) return a;
  const cut = a.slice(aM[0].length);
  if (!cut || cut === b) return a;
  /* 「和/与/及/或」也可能是并列项的开头，去掉后必须还剩效果或数值，
     否则「或更多」会被剥成「更多」 */
  if (/^(和|与|及|或)/.test(a) && !hasPred(cut) && !/[0-9]/.test(cut)) return a;
  return cut;
}

/* 按句末标点切成句子（保留标点），末尾没有标点的残句也算一句 */
function sentences(s) {
  const out = [];
  const re = /[^。！？\n]+[。！？]|[^。！？\n]+$/g;
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

/* 前后改动很大的两版：整句对整句输出，不压缩。用不可见字符包起来，
   buildDesc 看到就不再标金（两侧一字不差地抄着，标了反而像只改了个数） */
const BIG_OPEN = '\uE002', BIG_CLOSE = '\uE003';
/* 判定标准：开头 + 结尾能对上的不到两成，中间要重写超过 20 个字，两版长度相近。
   整句追加/删除（一侧完全罩住另一侧）、长度差四成以上的（多半是追加）都不算；
   两个分句内容调换（春风化雨）正好落在这条线上 */
function bigRewrite(b, a) {
  const M = Math.min(b.length, a.length), L = Math.max(b.length, a.length);
  if (M < 15) return '';
  if (a.startsWith(b) || b.startsWith(a)) return '';
  if (L > M * 1.4) return '';
  let p = 0;
  while (p < M && b[p] === a[p]) p++;
  let s = 0;
  while (s < b.length - p && s < a.length - p && b[b.length - 1 - s] === a[a.length - 1 - s]) s++;
  if ((p + s) / L >= 0.25) return '';
  if (L - p - s <= 20) return '';
  /* 「第一名：+60」和「第一名：+150」共用的只有「第一名：+」：把标签提到箭头前，
     两侧就不再各写一遍 */
  let tag = '';
  const colon = b.slice(0, p).match(/^[\s\S]*[：:]/);
  if (colon && b.slice(0, p).length - colon[0].length <= 3) tag = colon[0];
  return BIG_OPEN + tag + b.slice(tag.length) + ' → ' + a.slice(tag.length) + BIG_CLOSE;
}

