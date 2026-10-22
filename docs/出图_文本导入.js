/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* AI 偶尔把多条并列内容压成一行（出图会溢出）：这里按句号 / 分号硬拆成多条 ○。
   含「调整前…调整后…」的成对内容不拆，避免把一组对照拆散 */
function splitLongDigestLines(lines, max) {
  const seg = (s, re) => s.replace(re, '$1\u0000').split('\u0000').filter(Boolean);
  const cut = (s) => {
    const chunks = [];
    let buf = '';
    const push = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };
    seg(s, /([。；])/g).forEach(one => {
      if (buf && buf.length + one.length > max) push();
      if (one.length > max) {
        seg(one, /([，,、])/g).forEach(s2 => {
          if (buf && buf.length + s2.length > max) push();
          buf += s2;
        });
      } else buf += one;
    });
    push();
    return chunks;
  };
  const out = [];
  lines.forEach(line => {
    const m = line.match(/^([○●])\s*(.+)$/);
    if (!m || line.length <= max) { out.push(line); return; }
    const body = m[2];
    if (/调整前[\s\S]*调整后/.test(body)) { out.push(line); return; }
    const chunks = cut(body);
    if (chunks.length < 2) { out.push(line); return; }
    out.push(m[1] + ' ' + chunks[0]);
    /* 后续段落一律降级成 ○；拆出来的段首残留的 1./2./3. 编号去掉 */
    chunks.slice(1).forEach(c => out.push('○ ' + c.replace(/^\d+\s*[.、．]\s*/, '')));
  });
  return out;
}

/* AI 常把「活动介绍：…」这类字段另起一行又加了 ○：字段行按规则不带 ○，
   去掉让它在解析时并回上一条（超长行仍交给 splitLongDigestLines 处理） */
const DIGEST_FIELD_RE = /^(活动时间|活动介绍|活动说明|活动规则|活动期间|活动入口|获取方式|参与条件|参与方式|参与入口|兑换说明|兑换时间|兑换方式|奖励说明|奖励内容|售卖时间|售卖价格|折扣时间|首周折扣|祈愿时间|祈愿规则)\s*[：:]/;
function stripFieldMark(lines) {
  return lines.map(line => {
    if (line.length > 80) return line;
    const m = line.match(/^○\s*(.+)$/);
    if (!m) return line;
    const body = m[1].trim();
    return DIGEST_FIELD_RE.test(body) ? body : line;
  });
}

/* AI 有时把一整句带句号的话做成 ●/◆ 标题：这种行按规则必须是 ○，直接降级 */
function demoteSentenceTitles(lines) {
  return lines.map(line => {
    const m = line.match(/^([●◆])\s*(.+)$/);
    if (!m) return line;
    const body = m[2].trim();
    if (!/[。]$/.test(body)) return line;
    return '○ ' + body;
  });
}

/* AI 经常把宣传语、催促句留下来：按句尾模式直接剪掉这一段，不依赖模型。
   rep 是剪完要补回的标点：逗号引出的补句号，句号引出的保留句号 */
const URGE_RULES = [
  { re: /[，,]\s*(千万)?(不要|别|切莫)错过[^。；！!]*[。！!]?\s*$/, rep: '。' },
  { re: /[，,]\s*请(及时|尽快)(使用|兑换|领取|参与|购买)[^。；！!]*[。！!]?\s*$/, rep: '。' },
  { re: /[，,]\s*(抓紧|赶快|速速|不容错过)[^。；！!]*[。！!]?\s*$/, rep: '。' },
  { re: /([。；;])\s*(后续活动)?请留意(官方)?(公告|后续)[^。；！!]*[。！!]?\s*$/, rep: '$1' },
  { re: /([。；;])\s*(千万)?(不要|别)错过[^。；！!]*[。！!]?\s*$/, rep: '$1' },
  /* 逗号引出的短号召句（一起…看、请一定记得…领取、抓紧…），剪到句号；
     noDigit：被剪掉的短句里带数字时不动，避免误伤正文 */
  { re: /[，,]\s*[^，,。；！!]{0,12}?(?:一起|快来|赶紧|抓紧|速速|记得|试试|比比看|不见不散|等你|走起|别忘)[^，,。；！!]{0,12}[。！!]?\s*$/, rep: '。', noDigit: true },
  /* 逗号引出的短感叹收尾（语气词结尾），属于宣传语，整段剪掉 */
  { re: /[，,]\s*[^，,。；！!]{0,15}[哦呀啦哟][。！!]?\s*$/, rep: '。', noDigit: true }
];
function stripUrge(lines) {
  return lines.map(line => {
    let s = line;
    let hit = true;
    while (hit) {
      hit = false;
      for (const r of URGE_RULES) {
        const t = r.noDigit
          ? s.replace(r.re, (mm) => (/\d/.test(mm) ? mm : r.rep))
          : s.replace(r.re, r.rep);
        if (t !== s && t.replace(/[。；;，,\s]/g, '').trim()) { s = t; hit = true; }
      }
    }
    return s;
  });
}

/* 官方原文（以及 AI 返回的纯文字）里，很多标题并没有 ◆/● 标记，
   只是一行普通的「名字：说明」或「名字。」。以前全靠 AI 补符号，AI 一漏整块就没了。
   这里按文字特征把它们补成 ◆/●：已带标记的行、章节行、【分组】行、字段行一律不动。 */
const PLAIN_FIELD_RE = /^(活动时间|活动说明|活动介绍|活动规则|活动期间|活动入口|获取方式|参与条件|参与方式|参与入口|兑换说明|兑换时间|兑换方式|奖励说明|奖励内容|售卖时间|售卖价格|折扣时间|首周折扣|祈愿时间|祈愿规则)\s*[：:]/;
/* 名子里出现这些词 → 当成活动 / 系统 / 道具这类具体对象，用 ●；否则用 ◆ */
const PLAIN_OBJ_RE = /(活动|红包|祈愿|月卡|商城|商店|礼包|棋盘|皮肤|战报|会员|通行证|福袋|任务)/;
/* 名子以这些词结尾 → 是「某个东西的调整」，用 ◆ */
const PLAIN_TITLE_TAIL = /(调整|优化|修改|新增|说明|系统|活动|商城|商店|礼包|月卡|祈愿|红包|战报|宝典|通行证|会员)$/;
/* 句子开头就是动词 → 是说明不是标题 */
const PLAIN_SENT_HEAD = /^(优化|调整|新增|修复|提升|支持|移除|删除|降低|修改|更改|增加|关闭|开启|暂时|我们|玩家|同时|另外|所有|每次|每周|若|如果|请|可以)/;
const plainMark = name => (PLAIN_OBJ_RE.test(name) && !PLAIN_TITLE_TAIL.test(name) ? '● ' : '◆ ');

function recognizePlainTitles(lines) {
  const out = [];
  lines.forEach(line => {
    /* 已经有符号 / 章节 / 分组 / 字段行：原样保留 */
    if (/^[◆●○•#]/.test(line) || /^【[^】]+】$/.test(line)
      || /^[一二三四五六七八九十]+、/.test(line) || PLAIN_FIELD_RE.test(line)) {
      out.push(line);
      return;
    }

    /* 「名字：说明」——冒号左边必须是短名字（没有逗号句号），右边才是说明。
       名字很短、右边还带冒号时（「天使投资人：…；投资人同行：…」），说明整行是并列的一句话，不拆 */
    const m = line.match(/^([^：:，。；！？]{2,20})[：:]\s*(.+)$/);
    if (m && !PLAIN_SENT_HEAD.test(m[1]) && !(m[1].trim().length <= 6 && /[：:]/.test(m[2]))) {
      const name = m[1].trim(), body = m[2].trim();
      const short = body.replace(/[。.]$/, '');
      /* 「棋盘幻化：长安舞榭。」右边只是个名字，并回标题 */
      if (short.length <= 10 && !/[，；、]/.test(short)) {
        out.push(plainMark(name) + name + '：' + short);
        return;
      }
      if (PLAIN_TITLE_TAIL.test(name) || name.length <= 6) {
        out.push(plainMark(name) + name);
        out.push('○ ' + body);
        return;
      }
    }

    /* 「名字。」——整行只有一个短名字，去掉句号当标题（祈愿。 / 活动福利。） */
    const bare = line.replace(/[。.]$/, '');
    if (/[。.]$/.test(line) && bare.length <= 10 && !/[，；：:、！？]/.test(bare)
      && !PLAIN_SENT_HEAD.test(bare) && !/[了为是]/.test(bare)) {
      out.push(plainMark(bare) + bare);
      return;
    }

    out.push('○ ' + line);
  });
  return out;
}

function parseDigest(text) {
  const fromJson = parseJSONSections(text);
  if (fromJson) return normalizeSections(fromJson);

  const raw = String(text || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  const lines = stripUrge(splitLongDigestLines(demoteSentenceTitles(stripFieldMark(
    recognizePlainTitles(raw))), 80));
  const sections = [];
  let sec = null, grp = null, item = null;
  let lastSub = '';   /* 最近的 ◆ 三级标签，用于去掉紧接着重复的 ● 标题 */

  const flushItem = () => {
    if (!item) return;
    let d = normNewSubject(item.d.map(normDesc).join('\n').trim());
    /* 「活动时间：…；」后面没有内容时去掉悬空的分号/冒号 */
    d = d.replace(/[；;：:，,]+$/, '');
    if (item.attr) {
      if (d.indexOf(item.attr) !== 0) d = (item.attr + (d ? ' ' + d : '')).trim();
      item.t = item.t || '';
    }
    if (!item.t && d) {
      const parts = d.split('\n').filter(Boolean);
      /* 原文分条的内容被合并成一大段时，按分号拆回多条 ○；
         只有 3 段以上才拆，避免一句正常用分号的说明被拆碎 */
      const segs = (parts.length === 1 && parts[0].length > 100)
        ? parts[0].split('；').map(x => x.trim()).filter(Boolean)
        : [];
      if (segs.length >= 3) {
        segs.forEach(x => grp.items.push({ t: '', d: x.replace(/[；。]$/, '') }));
        item = null;
        return;
      }
    }
    if (item.t || d) grp.items.push({ t: item.t, d });
    item = null;
  };
  const flushGrp = () => {
    flushItem();
    if (grp && grp.items.length) sec.groups.push(grp);
    grp = null;
  };
  const flushSec = () => {
    flushGrp();
    if (sec && sec.groups.length) sections.push(sec);
    sec = null;
  };

  lines.forEach(line => {
    let m;
    /* 原文没有的空标签行直接丢弃 */
    if (DIGEST_EMPTY_LABEL.test(line)) return;
    if ((m = line.match(/^###\s+(.+)$/)) || (m = line.match(/^◆\s*(.+)$/))) {
      const title = m[1].trim();
      if (!sec) sec = { name: '', groups: [] };
      if (!grp) grp = { name: '', items: [] };
      flushItem();
      if (DIGEST_OBJ_TITLE.test(title)) {
        /* 对象名写成 ◆ 是错的，按 ● 条目处理 */
        const nt = normItemTitle(title, grp.name);
        item = { t: nt.title, d: [], attr: nt.attr };
        return;
      }
      /* 连续出现两次同名 ◆：只保留第一个标签 */
      const last = grp.items[grp.items.length - 1];
      if (last && last.sub && sameLabel(last.t, title)) { lastSub = last.t; return; }
      grp.items.push({ t: title, d: '', sub: true });
      lastSub = title;
      return;
    }
    /* 分类小标题漏写 ◆ 时也要按三级标签处理，不能拼进上一条正文 */
    if (SUB_LABEL_RE.test(line)) {
      if (!sec) sec = { name: '', groups: [] };
      if (!grp) grp = { name: '', items: [] };
      flushItem();
      /* 已经是同名标签时不再重复添加 */
      const last = grp.items[grp.items.length - 1];
      if (last && last.sub && sameLabel(last.t, line)) { lastSub = last.t; return; }
      grp.items.push({ t: line, d: '', sub: true });
      lastSub = line;
      return;
    }
    if ((m = line.match(/^##\s+(.+)$/)) || (m = line.match(/^【(?!\/?新增】)([^【】]+)】$/))) {
      if (!sec) sec = { name: '', groups: [] };
      flushGrp();
      grp = { name: m[1].trim(), items: [] };
      lastSub = '';
      return;
    }
    if ((m = line.match(/^#\s+(.+)$/)) || /^[一二三四五六七八九十]+、/.test(line)) {
      flushSec();
      sec = { name: line.replace(/^#\s+/, ''), groups: [] };
      lastSub = '';
      return;
    }
    if ((m = line.match(/^[●•]\s*(.+)$/)) || (m = line.match(/^[-*]\s+(.+)$/))) {
      if (!sec) sec = { name: '', groups: [] };
      if (!grp) grp = { name: '', items: [] };
      flushItem();
      const nt = normItemTitle(m[1], grp.name);
      /* 紧跟在同名 ◆ 标签后的 ●（如「◆ 受击回蓝调整」+「● 受击回蓝调整」）：
         标签只保留一份，这条按无标题说明处理 */
      const dupSub = sameLabel(lastSub, nt.title);
      /* 「● 英雄技能调整」这类分类名仍是小标题，不能画成正文卡 */
      if (SUB_LABEL_RE.test(nt.title) && !dupSub) {
        grp.items.push({ t: nt.title, d: '', sub: true });
        lastSub = nt.title;
        return;
      }
      /* 「◆ 对局选人方式调整」+「● 对局选人方式」这类重复标题只保留 ◆；
         「◆ 6级天赋领取逻辑调整」+「● 6级天赋领取逻辑调整」结尾同字，也要去掉重复 */
      if (dupSub) nt.title = '';
      lastSub = '';
      item = { t: nt.title, d: [], attr: nt.attr };
      return;
    }
    if ((m = line.match(/^○\s*(.*)$/))) {
      if (!sec) sec = { name: '', groups: [] };
      if (!grp) grp = { name: '', items: [] };
      const oval = m[1].trim();
      /* 「● 我是主播」紧接着「○ 新增称号：【我是主播】…」：名字已经在说明里，
         这条 ● 只是把同一句话拆成了两行，去掉标题并回一条 ○ */
      if (item && item.t && !item.d.length && oval.indexOf(item.t) >= 0) item.t = '';
      /* 「○ 6级天赋领取逻辑调整」这类规则标题单独成条，与棋手同级，
         不能并进上一位棋手的正文；但前面已经有同名 ◆ 标签时不再重复 */
      if (isRuleTitle(oval)) {
        if (sameLabel(lastSub, oval)) return;
        flushItem();
        item = { t: oval, d: [] };
        return;
      }
      /* 「● 角色 · 属性」后面的第一条 ○ 并进该条目，拼成「属性 数值」 */
      if (item && item.attr && !item.d.length) {
        item.d.push(oval);
        return;
      }
      /* 前一条 ● 只有标题没有说明时，第一条 ○ 并入该条，避免多出一张只有标题的空卡片；
         只有 ○ 内容确实以「标题 + 序号/冒号」重复时才去掉标题（「祈愿福利」+「祈愿福利1：…」）；
         「蒙犽」+「蒙犽发射…」这种正文只是碰巧以标题开头，标题必须保留 */
      if (item && !item.d.length && String(item.t || '').trim()) {
        const oldT = String(item.t).trim();
        const val = oval;
        const rest = val.slice(oldT.length);
        if (!rest || /^\s*(?:\d+\s*)?[：:]/.test(rest)) item.t = '';
        item.d.push(val);
        return;
      }
      flushItem();
      item = { t: '', d: oval ? [oval] : [] };
      return;
    }
    /* 普通行：作为当前条目的说明；没有条目时按无标题条目处理 */
    if (!sec) sec = { name: '', groups: [] };
    if (!grp) grp = { name: '', items: [] };
    /* 棋手标题后面直接跟「6级天赋领取逻辑调整」这类规则标题 → 另起一条，
       不拼进该棋手正文（随后由 buildChessItems 提升为同级标题） */
    if (item && item.t && !item.d.length && isRuleTitle(line)
      && (/棋手/.test(grp.name || '') || isChessName(item.t))) {
      flushItem();
    }
    if (!item) item = { t: '', d: [] };
    item.d.push(line);
  });
  flushSec();
  return normalizeSections(sections);
}
