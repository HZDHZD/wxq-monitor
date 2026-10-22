/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
function makeItems(lines, grpName, allowSkill, flat, newScope, guessNames, verbatim, state) {
  /* 「问题修复」原文每一行就是一条，逐条拆开，不能拼成一段 */
  if (/问题修复/.test(grpName || '')) {
    const out = [];
    lines.forEach(l => {
      const t = l.text.trim();
      if (!t) return;
      /* 整行加粗的短标题（「钻石狂潮」）是这一组的小标题，
         不能当成一条修复内容单独占一张无标题卡 */
      if (l.bold && l.bold === t && t.length <= 14 && !/[。！？；：，、]$/.test(t)) {
        out.push({ t, d: '', sub: true });
        return;
      }
      if (!out.length || FIX_VERB_RE.test(t)) out.push({ t: '', d: t });
      else {
        /* 上一行已经是一句完整的话（以句号结尾）而这一行也独立成句时补分号，
           避免两条修复粘成一句；真正的 <br> 续行（两侧都无句末标点）仍然直接拼 */
        const prevD = out[out.length - 1].d;
        const cont = /^[的着了过并且或与及和、，,）)】」…—]/.test(t) || /[（(【「]$/.test(prevD);
        const sep = (!cont && !/[。！？；;]$/.test(prevD) && /[。！？；;]$/.test(t)) ? '；' : '';
        out[out.length - 1].d = prevD + sep + t;
      }
    });
    return out;
  }
  const items = [];
  /* 棋手分组里最近一个「角色 · 天赋」的角色名：同一角色的第二个天赋原文常常
     只写天赋名（马可「重点照顾」），出图时要靠角色名复用同一张立绘。
     平铺公告会把「调整前 / 调整后」切成分块逐块解析，角色名必须跨块记住 */
  let chessRole = (state && state.role) || '';
  let i = 0;
  let forcedStart = false;   /* 三级标签之后的一行必须另起条目，不能并入标签 */
  /* 「新增天赋」段一行一条：上一行以句号收尾、本行是「名称：说明」时另起一条，
     否则三条新增天赋会被并成一张无标题卡 */
  const startAt = i => isStartLine(lines, i)
    || (newScope && i > 0 && /[。！？；]$/.test(lines[i - 1].text.trim())
      /* 「调整后：…」也长得像「名称：说明」，但它只是上一条的对照段，
         认成条目名会让整条「调整后」内容脱离上一条、调整前那半句也压不成箭头 */
      && !NOT_NAME_RE.test(lines[i].text.trim())
      && NEW_ITEM_LINE_RE.test(lines[i].text.trim()));
  while (i < lines.length) {
    /* 一行一个 <p> 的公告：技能/秘技/专属和编号行都属于上一条的正文，
       不能新起条目，否则会和棋手名同级 */
    if (flat && items.length) {
      const cur = items[items.length - 1];
      if (!cur.sub && (ATTR_HEAD_RE.test(lines[i].text)
        || /^[0-9]{1,2}[.、．](?![0-9])/.test(lines[i].text)
        /* 「专属」下面的特性小标题（落英汲取：枫之洪流：…）也属于上一条正文 */
        || /^[^：:]{1,10}[：:]$/.test(lines[i].text.trim())
        || (lines[i].bold && /^[^：:]{1,10}[：:]$/.test(lines[i].bold.trim())))) {
        (cur._extra = cur._extra || []).push(lines[i].text);
        i++;
        forcedStart = false;
        continue;
      }
    }
    /* 三级标签独占一条，后续条目单独解析 */
    if (isSubLabel(lines, i)) {
      const t = lines[i].text.trim();
      /* 与分组同名的小标题不重复渲染 */
      if (t !== clean(grpName || '')) items.push({ t, d: '', sub: true });
      forcedStart = true;
      i++;
      continue;
    }
    if (!forcedStart && !startAt(i)) {
      if (!items.length) {
        items.push({ t: '', d: '', _lines: [lines[i].text] });
      } else {
        const cur = items[items.length - 1];
        /* 平铺公告的续行直接归到上一条正文，不做「无标题条目」拆分 */
        if (flat) (cur._extra = cur._extra || []).push(lines[i].text);
        else {
          cur._lines = cur._lines || [];
          cur._lines.push(lines[i].text);
        }
      }
      i++;
      continue;
    }

    forcedStart = false;
    const first = lines[i];
    let name = '', rawName = '', fromColon = false, presetRest = null, nameNew = false;
    if (first.bold) {
      name = first.bold;
      rawName = name;
    } else if (newScope && NEW_ITEM_LINE_RE.test(first.text)) {
      /* 「新增天赋」段没有加粗名，条目名直接写在「名称：说明」的冒号前 */
      const m = first.text.match(/^([^：:，。；]{2,12})[：:]\s*(\S.*)$/);
      if (m) {
        name = m[1].trim();
        presetRest = m[2].trim();
        /* 「技能突破：亚瑟：获得…」：前缀天赋名之后紧跟角色名，一并作为标题 */
        if (TALENT_HEAD_RE.test(name)) {
          const m2 = presetRest.match(/^([^：:，。；]{1,10})[：:]\s*(\S.*)$/);
          if (m2) {
            name += '：' + m2[1].trim();
            presetRest = m2[2].trim();
          } else if (presetRest.length <= 8 && !/[，。；：]/.test(presetRest)) {
            /* 「技能突破：亚瑟」后面直接换行写说明：角色名并进标题，
               不能留在正文第一行（18916493 的「新增：技能突破 / 亚瑟」） */
            name += ' · ' + presetRest;
            presetRest = '';
          }
        }
        rawName = name;
      }
    } else if (/[：:]\s*$/.test(first.text)) {
      const t0 = first.text.replace(/[：:]\s*$/, '').trim();
      if (t0.length <= 12 && !/[。；]/.test(t0)) { name = t0; rawName = t0; fromColon = true; }
    } else if (!flat && /（新增）$/.test(first.text.trim())) {
      /* 「处决标记（新增）」：原文用「（新增）」表示这是新条目，名字在括号前。
         名单里查得到就用名单写法（香香 · 处决标记），查不到也照名字出标题
         （新版本才加的技能，素材名单里还没有） */
      const mNew = first.text.trim().match(/^【?(.{2,12}?)】?（新增）$/);
      if (mNew && !/[。！？；，、：:]/.test(mNew[1])) {
        const lk2 = lexLookup(mNew[1]);
        name = lk2
          ? (lk2.kind === 'skill' && lk2.owner ? lk2.owner + ' · ' + lk2.name : lk2.name)
          : mNew[1].trim();
        rawName = mNew[0];
        nameNew = true;
      }
    } else if (guessNames && (SHORT_RE.test(first.text) || NAME_LINE_RE.test(first.text)) && !NOT_NAME_RE.test(first.text)) {
      /* 只有原文完全没有加粗信息（纯文本粘贴）时，才靠「短名」猜标题；
         有加粗的公告里，未加粗的短名一律留在正文当「标签：内容」 */
      rawName = first.text;
      name = rawName;
      /* 天赋名本身就用冒号连接（如「技能突破：亚瑟」）时照抄官方写法；
         只有「角色名：技能名」这类才改成间隔号 */
      const m0 = name.match(/^([^：:]{1,12})[：:]\s*(\S.{0,12})$/);
      if (m0) {
        const left = m0[1].trim(), right = m0[2].trim();
        name = TALENT_HEAD_RE.test(left) ? left + '：' + right : left + ' · ' + right;
      }
    } else if (!flat && looksLikeEndingName(first.text) && i < lines.length - 1) {
      /* 没加粗的短名后面还跟着正文：这行是条目名，不是正文的第一句
         （「王中王匹配逻辑调整」+ 说明段落） */
      name = first.text.trim();
      rawName = name;
    } else if (!flat && (lexLookup(first.text) || looksLikeItemName(first.text.trim()))) {
      /* 名字没加粗的条目：先查官方名单（蒙恬 / 亚连 / 镜 / 蒙犽 / 苍、丢盔弃甲），
         查不到再退回「短名」判断 */
      name = first.text.trim();
      rawName = name;
    }

    /* 「天赋调整：春风化雨」这类条目名重复了分组名，去掉前缀只留条目名 */
    const gp = clean(grpName || '');
    if (gp && name.indexOf(gp + '：') === 0) name = name.slice(gp.length + 1).trim();

    let rest = presetRest != null ? presetRest
      : ((name && !fromColon) ? first.text.replace(rawName || name, '').trim() : '');
    let skill = '', j = i + 1;
    /* 只有棋手「角色 + 技能」才把下一行短名并入标题；
       英雄调整里紧跟的「基础技能 / 攻击力 / 10级」是属性档位，留在正文 */
    if (allowSkill && name && j < lines.length) {
      const nx = lines[j];
      if (!nx.bold && SHORT_RE.test(nx.text) && !NOT_NAME_RE.test(nx.text) && !/[。！？；：:]$/.test(nx.text)
        && !TIER_LABEL_RE.test(nx.text.trim())
        && !(flat && /[：:]/.test(nx.text))) {
        skill = nx.text;
        j++;
      }
    }

    const body = [];
    if (!name) body.push(first.text);
    else if (rest) body.push(rest);
    for (; j < lines.length; j++) {
      /* 「技能 / 初始法力值 / 10级」这类档位标签属于上一条：上一句已经收尾也
         不另起一张只有标签名的卡，交给正文按「标签：内容」排 */
      if (startAt(j) && !(!lines[j].bold && TIER_LABEL_RE.test(lines[j].text.trim()))) break;
      body.push(lines[j].text);
    }

    let full = name ? (skill ? name + ' · ' + skill : name) : '';
    /* 后一个天赋没有角色名时继承上一条的角色（马可 → 马可 · 重点照顾）；
       带「·」的是新角色，档位标签和三级标签不算天赋名 */
    if (allowSkill && name && !skill && chessRole && name !== chessRole
      && !/[·・]/.test(name) && !TIER_LABEL_RE.test(name) && !SUB_RE.test(name)
      && !NOT_NAME_RE.test(name)) {
      full = chessRole + ' · ' + name;
    }
    if (allowSkill && name && skill) chessRole = name;
    if (state) state.role = chessRole;
    /* 记住这一条是不是英雄条目（加粗，或名字命中英雄名单），
       后面单独的「10级 / 攻击力」要挂回这个英雄。
       档位标签（「10级技能」这种）加粗也不能算英雄，否则它自己会变成英雄条目，
       后面的档位就挂不回真正的英雄了 */
    const nk = name ? lexLookup(name) : null;
    const desc = buildDesc(body, verbatim);
    /* 行首编号会被 buildDesc 去掉：记下原编号，后面的编号续段靠它并回上一条 */
    const numM = String(first.text).match(/^([0-9]{1,2})[.、．](?![0-9])/);
    items.push({
      t: full.replace(/\s*·\s*/g, ' · '),
      d: nameNew && verbatim !== 'plain' ? wrapNewBody(desc) : desc,
      _hero: (!!first.bold || (!!nk && nk.kind === 'hero')) && !TIER_LABEL_RE.test(full.trim()),
      /* 原文以冒号收尾（「…做如下调整：」），说明后面还有续段 */
      _cont: /[：:]\s*$/.test((body[body.length - 1] || '').trim()),
      /* 正文原始行：「调整后」单独成段时并回上一条重新压箭头要用 */
      _raw: body,
      _num: numM ? Number(numM[1]) : 0
    });
    i = j;
  }
  return items.map(it => {
    if (!it.t && it._lines) {
      it._cont = /[：:]\s*$/.test(String(it._lines[it._lines.length - 1] || '').trim());
      it.d = buildDesc(it._lines, verbatim);
    }
    /* 平铺公告攒下来的正文：一行一行保留，编号和技能行不要挤成一句 */
    if (it._extra && it._extra.length) {
      const add = it._extra
        .map(l => /[：:]$/.test(String(l).trim()) ? String(l).trim() : buildDesc([l], verbatim))
        .filter(Boolean).join('\n');
      it.d = it.d ? String(it.d).replace(/\s+$/, '') + '\n' + add : add;
    }
    delete it._lines;
    delete it._extra;
    return it;
  });
}

/* 第一章（名字里带「核心玩法」，写成「更新」或「调整」都算）用全原文：
   只压成「旧 → 新」，不删减改写。整段插入/调序压不动时，交回压缩算法按句对齐 */
const RAW_SEC_RE = /核心玩法/;

/* 二级标题其实是条目名（棋手 / 英雄 / 天赋 / 技能）时，把它并进这一组的第一条：
   「闹闹」+「朋友多多」→「闹闹 · 朋友多多」；组里没有独立名字时直接当标题
   （「安琪拉」+ 说明段落 →「安琪拉」）。技能名带上所属棋手（香香 · 战术·借势） */
function foldNameGroups(sections) {
  sections.forEach(sec => {
    (sec.groups || []).forEach(g => {
      const nm = g._nameItem;
      if (!nm) return;
      delete g._nameItem;
      delete g._nameItemKind;
      const lk = lexLookup(nm);
      const head = lk && lk.kind === 'skill' && lk.owner ? lk.owner + ' · ' + nm : nm;
      const first = g.items.find(it => !it.sub && (it.t || it.d));
      if (!first) return;
      if (!first.t) first.t = head;
      else if (first.t !== head) first.t = head + ' · ' + first.t;
    });
  });
}

