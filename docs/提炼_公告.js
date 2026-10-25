/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* 英雄/棋手后面单独成段的属性行常带「调整」后缀（玄雍士兵攻击速度调整）：
   它仍然是这名角色的属性，要并回角色说明，不能另起子条目 */
const ATTR_ADJ_LABEL_RE = /^.{0,10}(?:攻击速度|攻击力|生命值|法力值|护盾|技能范围|冷却|消耗|物理防御|法术防御|伤害|等级)(?:调整|优化)$/;

function parseNotice(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const sections = [];
  let sec = null, grp = null;
  /* 棋手分组内跨分块共用的角色名（平铺公告按「调整前/调整后」切块解析） */
  let grpState = { role: '' };
  /* 当前章节是否全原文模式 */
  let secRaw = false;
  /* 「新增天赋」这类小标题管住后面连续的内容，直到出现「天赋调整」一类的标题。
     注意整组不一定是新增（「天赋新增及调整」里既有新增天赋也有调整天赋），
     所以没被小标题关掉的条目还要看内容：带调整前/调整后的不算新增 */
  let markNew = false;
  /* 当前分组里最近一条加粗条目（英雄/棋手），用于把「10级」「攻击力」这类补充行挂回去 */
  let lastHeroItem = null;
  /* 一行一个 <p>、全文没有 <br> 的公告（18863590）：逐 P 解析会把每行都当成新条目，
     先把同一分组内连续的行攒成一块，再统一判断标题和正文 */
  const flat = !host.querySelector('br') && host.querySelectorAll('p').length >= 3;
  /* 原文没有任何加粗信息（纯文本粘贴），或整篇没有标题标签（加粗只用来标分类、
     条目名本身没加粗）时，才允许按短名猜标题 */
  const guessNames = (flat && !host.querySelector('strong, b')) || !host.querySelector('h1, h2, h3');
  /* 整篇没有章节标题（10.20 体验服这类只写「棋手调整 / 英雄调整」分组）：
     全文就是第一章，长句也要走全原文 / 就地精简 */
  const onlyChapter = !host.querySelector('h1');
  /* 第一篇有名字的章节就是第一章（局内），沿用原来的全原文 / 精简逻辑；
     后面的章节都是局外，完全照抄原文：不配对调整前后、不压箭头、不标金 */
  let coreOpened = false;
  let flatBuf = [];

  const openSec = name => {
    const nm = clean(name);
    const isFirst = !coreOpened;
    if (nm && !/^(未分类|其他|其它|正文)$/.test(nm)) coreOpened = true;
    sec = { name, groups: [] };
    sections.push(sec);
    grp = null;
    lastHeroItem = null;
    secRaw = isFirst ? (onlyChapter || RAW_SEC_RE.test(nm)) : 'plain';
  };
  const openGrp = name => {
    if (!sec) openSec('未分类');
    grp = { name, items: [] };
    sec.groups.push(grp);
    grpState = { role: '' };
    lastHeroItem = null;
  };

  /* 「棋手 + 技能」两级标题的判定：章节名带「棋手」最准；整篇没有章节名时
     退回看分组名（「棋手调整」），否则技能名会被当成正文 */
  const chessScope = () => /棋手/.test((sec && sec.name) || '') || /棋手/.test((grp && grp.name) || '');

  const isNewScope = l => (l.bold || l.text.length <= 8) && NEW_SCOPE_RE.test(clean(l.text));
  const isEndScope = l => {
    const t = clean(l.text);
    return l.bold && t.length <= 14 && !/[。！？；：，、]$/.test(t) && END_SCOPE_RE.test(t);
  };

  /* 原文常把「调整前 / 调整后」拆成两个段落，先攒齐整组，再交给 buildDesc 配对 */
  let adjLines = null;
  /* 与 adjLines 一一对应的原话（归一化之前），只给「原文」栏用 */
  let adjSrc = null;
  /* 标题段里就地切开时（「毒奶 / 降低…伤害。 / 调整前：…」），后面的数值
     属于刚生成的这条标题，不能另起一张无标题卡 */
  let adjOwner = false;
  const flushAdj = () => {
    if (!adjLines || !adjLines.length) { adjLines = null; adjSrc = null; adjOwner = false; return; }
    const blk = adjLines;
    const d = buildDesc(blk, secRaw);
    adjLines = null;
    const own = adjOwner;
    adjOwner = false;
    if (!grp || !d) { adjSrc = null; return; }
    const last = grp.items[grp.items.length - 1];
    const blkSrc = (adjSrc || blk).join('\n');
    adjSrc = null;
    if (last && last.t && !last.d && !last.sub) { last.d = d; addSrc(last, blkSrc); }
    /* 「调整后」单独成段、前一段是同一个条目的「调整前」：并回去重压箭头，
       否则两版会拆成两张卡，数值也压不成箭头（神机） */
    else if (last && last.t && !last.sub && last._raw && /^调整后/.test(blk[0])
      && last._raw.some(s => /^调整前/.test(s)) && !last._raw.some(s => /^调整后/.test(s))) {
      const raw = last._raw.concat(blk);
      last.d = buildDesc(raw, secRaw) || d;
      last._raw = raw;
      last._cont = false;
      addSrc(last, blkSrc);
    }
    else if (own && last && last.t && !last.sub) {
      last.d = last.d ? last.d.replace(/\s+$/, '') + '\n' + d : d;
      addSrc(last, blkSrc);
    }
    /* 上一段以「…做如下调整：」收尾时，调整前/后就是它的续写，不能另起一张无标题卡 */
    else if (last && !last.sub && last._cont) {
      const base = (last.d || '').replace(/[。；;]\s*$/, '');
      /* 续写是多行块（按玩法/编号分行）时另起一行，用冒号引出；
         单句续写仍接在原句后面 */
      last.d = /\n/.test(d) ? base + (/[：:]$/.test(base) ? '\n' : '：\n') + d : base + '。' + d;
      last._cont = false;
      addSrc(last, blkSrc);
    }
    else grp.items.push(blkSrc ? { t: '', d, src: blkSrc } : { t: '', d });
  };

  /* 统一入库：补充行挂回所属英雄，并处理「新增：」作用域 */
  const pushItems = list => {
    list.forEach(it => {
      /* 二级标题是英雄名时，这一组的第一条就是这名英雄的卡：后面单独的
         「10级：/100级：/攻击力：」要挂回它 */
      const namedHero = grp._nameItemKind === 'hero' && !grp.items.length && !it.sub;
      const isHero = it._hero || namedHero;
      delete it._hero;
      if (isHero) {
        lastHeroItem = it;
      } else if (lastHeroItem && it.t && !it.sub && grp.items[grp.items.length - 1] === lastHeroItem) {
        const t = it.t.trim();
        /* 「10级 / 攻击力 / 基础技能」这类档位补进上一条英雄的说明，不当标题 */
        if (t.length <= 20 && !/[。！？；，、：:]/.test(t)
          && (TIER_LABEL_RE.test(t) || ATTR_ADJ_LABEL_RE.test(t))) {
          const line = t + (it.d ? '：' + it.d : '');
          lastHeroItem.d = lastHeroItem.d ? lastHeroItem.d + '\n' + line : line;
          addSrc(lastHeroItem, it.src || line);
          return;
        }
      }
      /* 英雄条目后面单独成段的档位 / 属性行并回这名英雄，不另起空标题卡：
         「10级：…」「10级技能：…」「机械仆从攻击速度：…」（18915134 的梦奇 / 米莱狄） */
      if (!it.t && it.d && lastHeroItem && grp.items[grp.items.length - 1] === lastHeroItem
        && /^([0-9]{1,3}级(?:技能|被动|普攻|主动|大招|奥义|效果|伤害)?|基础技能|被动技能|主动技能|技能|[^：:]{0,10}(攻击速度|攻击力|生命值|法力值|护盾|技能范围|冷却|消耗|能量|物理防御|法术防御|伤害)(?:调整|优化)?)[：:]/.test(String(it.d).trim())) {
        lastHeroItem.d = (lastHeroItem.d ? lastHeroItem.d + '\n' : '') + String(it.d).trim();
        addSrc(lastHeroItem, it.src || String(it.d).trim());
        lastHeroItem._cont = false;
        return;
      }
      /* 上一条只有标题、正文还在下一段：原文常把加粗标题单独放一段，
         中间还可能夹一个只有图片的空段，正文不能另起一张无标题卡 */
      if (!it.t && it.d && grp.items.length) {
        const prev = grp.items[grp.items.length - 1];
        if (prev.t && !prev.sub && !prev.d) {
          prev.d = String(it.d);
          prev._raw = prev._raw || [];
          prev._cont = !!it._cont;
          addSrc(prev, it.src || String(it.d));
          return;
        }
      }
      /* 「详细规则：/调整如下：」后面的编号列表常被原文拆成多个段落：
         编号续行（2.、3.）和冒号续行并回上一条，否则会散成一堆无标题卡片，
         而且上一条会以悬空的冒号结尾 */
      if (!it.t && it.d && grp.items.length) {
        const prev = grp.items[grp.items.length - 1];
        if (!prev.sub && prev.d) {
          /* buildDesc 会把行首编号去掉，续段的编号要看原始行（_num） */
          const num = it._num ? String(it._num) : (String(it.d).match(/^([0-9]+)[.、．]/) || [])[1];
          const prevHasNum = n => new RegExp('(^|[；;。：:\\s])' + (n - 1) + '[.、．]').test(prev.d);
          /* plain() 会把「…做如下调整：」补成句号，所以悬空冒号要看 _cont 标记 */
          const colonTail = !!prev._cont || /[：:]\s*$/.test(prev.d);
          if ((num && Number(num) > 1 && prevHasNum(Number(num))) || colonTail) {
            const add0 = String(it.d).replace(/^[；;。\s]+/, '');
            /* 编号被 buildDesc 去掉时补回原文编号，各条编号保持一致 */
            const add = num && !/^[0-9]{1,2}[.、．]/.test(add0) ? num + '.' + add0 : add0;
            /* 编号续行（2. / 3.）单独起一行，不能挂在上一句分号后面 */
            const sep = /^[0-9]{1,2}[.、．]/.test(add) && secRaw ? '\n' : '；';
            prev.d = colonTail
              ? String(prev.d).replace(/\s+$/, '') + add
              : String(prev.d).replace(/[。；;]\s*$/, '') + sep + add;
            addSrc(prev, it.src || add);
            /* 续段本身仍以冒号收尾时继续等待下一段 */
            prev._cont = /[：:]\s*$/.test(add);
            return;
          }
        }
      }
      if (!it.t && !it.d) return;
      /* 带「调整前 / 调整后」的条目是在改老内容，不是新增，标签再怎么写都不能当新增
         （正文此时已经压成箭头，所以要看原始行 _raw）。
         局外章节（secRaw = 'plain'）原来不加前缀，导致「新增天赋」整段看不出是新增
         （18915134 的帝临 / 勇冠三军 / 孙尚香），现在一律加：前缀只是标题标记，
         不影响正文照抄原文 */
      const rawAdj = Array.isArray(it._raw) ? it._raw.join('') : String(it.d || '');
      if (markNew && it.t && !it.sub && !/^新增[：:]/.test(it.t)
        && !/调整前|调整后/.test(rawAdj)) {
        /* 前面已有「新增：」时，天赋名里的冒号改用间隔号，避免一行两个冒号 */
        it.t = '新增：' + it.t.replace(/^([^：:]{1,12})[：:]\s*(\S.{0,12})$/, '$1 · $2');
      }
      grp.items.push(it);
    });
  };

  /* 平铺公告：把攒下的连续行按「标题 + 正文」一次分条。
     「调整前 / 调整后」不单独切块：它们和「10级：…」这类档位行属于同一条正文，
     交给 buildDesc 统一配对，不能按行切碎（否则安琪拉/海诺的数值永远压不成箭头） */
  const flushFlat = () => {
    if (!flatBuf.length) return;
    const buf = flatBuf;
    flatBuf = [];
    if (!grp) return;
    pushItems(makeItems(buf, grp.name, chessScope(), true, markNew, guessNames, secRaw, grpState));
  };

  /* 正文偶尔整体包在 <div>/<section> 里：遇到容器继续向内遍历，
     否则整篇公告会被当成空内容 */
  const walk = node => Array.from(node.children).forEach(el => {
    const tag = el.tagName;
    if (/^(DIV|SECTION|ARTICLE|MAIN|BLOCKQUOTE)$/.test(tag)) { walk(el); return; }
    if (tag === 'H1') { flushFlat(); flushAdj(); markNew = false; openSec(clean(el.textContent)); return; }
    if (tag === 'H2' || tag === 'H3') {
      flushFlat();
      flushAdj();
      const nm = clean(el.textContent);
      markNew = NEW_SCOPE_RE.test(nm);
      /* 「天赋调整：春风化雨」：冒号前半截正好是当前分组名，说明它不是新分组，
         只是这个分组下的三级标签（18891351）。别新开一个同名分组 */
      const mColon = nm.match(/^(.{2,12})[：:](.+)$/);
      if (mColon && grp && grp.name && clean(mColon[1]) === clean(grp.name)) {
        grp.items.push({ t: mColon[2].trim(), d: '', sub: true });
        return;
      }
      /* 二级标题也可能本身就是条目名（18915134 的「闹闹」其实是棋手名、
         18891351 的「【战术·借势】」是香香的技能）：先开一个空名分组，
         解析完再把这些分组折回条目（foldNameGroups） */
      const lk = lexLookup(nm);
      if (lk) {
        openGrp('');
        grp._nameItem = nm;
        grp._nameItemKind = lk.kind;
      } else {
        openGrp(nm);
      }
      return;
    }
    if (tag !== 'P') return;
    let lines = linesOf(el, secRaw === 'plain');
    /* 有的公告整篇没有 H1/H2/H3，分类标题只是段落首行的整行加粗
       （「棋手调整 / 天赋调整 / 英雄调整…」）。整行加粗、够短、没有句末标点、
       以「调整 / 更新 / 修复 / 说明」收尾的首行按分组标题处理 */
    const head = lines[0];
    /* 「拍卖优化」这类以「优化」收尾的标题：只在核心玩法章里、且下一段是
       1./2./3. 列表时才当分组；其它章的「夺宝优化」等仍是普通条目 */
    const nextEl = el.nextElementSibling;
    const optHead = /(优化|改动)$/.test(head ? head.text : '')
      && !!sec && /核心玩法/.test(sec.name)
      && !!nextEl && /^[1１][.、．]/.test(clean(nextEl.textContent || ''));
    if (head && head.bold && head.bold === head.text && head.text.length <= 14
      && !/[。！？；：，、]$/.test(head.text)
      /* 整篇还没有章节（没有 h1）时，首行加粗短名就是分类标题：
         「活动优化」「王牌对决」「新手体验」这类不以调整/更新/修复收尾的
         也要开分组，否则这一段会被整段丢掉（18885635 / 18873181） */
      && (END_SCOPE_RE.test(head.text) || optHead || !sec)
      && !(grp && clean(grp.name) === head.text)) {
      flushFlat(); flushAdj();
      /* 「天赋调整：春风化雨」：冒号前半截正好是当前分组名，说明它只是这个
         分组下的三级标签，不能新开一个同名分组（18891351） */
      const mColon = head.text.match(/^(.{2,12})[：:](.+)$/);
      if (mColon && grp && grp.name && clean(mColon[1]) === clean(grp.name)) {
        grp.items.push({ t: mColon[2].trim(), d: '', sub: true });
        lines = lines.slice(1);
        if (!lines.length) return;
      } else if (grp && (!grp.items.length || grp.items.some(it => it.sub))) {
        /* 刚开的分组还没有条目、或已经有三级标签：接着来的加粗小标题
           其实是这个分组的下级，不能再开一个同级分组
           （18916493「英雄调整 → 英雄技能调整 / 卡牌效果调整」） */
        grp.items.push({ t: head.text, d: '', sub: true });
        lines = lines.slice(1);
        if (!lines.length) return;
      } else {
        /* 没有章节可挂时开一个空名章节：出图侧空章节名不画章节条 */
        if (!sec) openSec('');
        markNew = NEW_SCOPE_RE.test(head.text);
        openGrp(head.text);
        lines = lines.slice(1);
        if (!lines.length) return;
      }
    }
    if (!lines.length || !sec) return;
    /* 章节下面还没有分组时开一个空名分组：不要拿章节名当分组名，
       否则「二、娱乐玩法更新」会出现章节、分组两条同名标题 */
    if (!grp) openGrp('');
    if (flat) { flatBuf.push(...lines); return; }

    /* 「调整前 / 调整后」段落先攒着，遇到下一个普通段落或新标题时再统一配对。
       局外章节原样照抄，不做配对 */
    if (secRaw !== 'plain' && /^调整[前后]/.test(lines[0].text)) {
      adjLines = (adjLines || []).concat(lines.map(l => l.text));
      adjSrc = (adjSrc || []).concat(lines.map(l => l.raw || l.text));
      return;
    }
    flushAdj();

    /* 标题段里夹着独立的「调整前」行（如「虞姬 / 调整前 / 觉醒前…」）：
       先把标题落成条目，后半段与下一段的「调整后」配对，避免拆成两张卡 */
    const markIdx = secRaw === 'plain' ? -1 : lines.findIndex((l, k) => k > 0 && /^调整[前后][：:]?$/.test(l.text));
    if (markIdx > 0) {
      pushItems(makeItems(lines.slice(0, markIdx), grp.name, chessScope(), false, markNew, guessNames, secRaw));
      adjLines = lines.slice(markIdx).map(l => l.text);
      adjSrc = lines.slice(markIdx).map(l => l.raw || l.text);
      adjOwner = true;
      return;
    }

    /* 段落首行的整行标题只决定作用域，不作为条目内容 */
    if (isNewScope(lines[0])) { markNew = true; lines = lines.slice(1); }
    else if (isEndScope(lines[0])) { markNew = false; }
    if (!lines.length) return;

    /* 局外：原文有时把「调整后 / 改动后 / 觉醒后」单独写成一个没有标题的段
       （神机：改动前在上一条里，改动后另起一段）。它仍是上一条的对照内容，
       原文照抄地接在上一条后面；拆成空标题卡会看不出一一对应 */
    const afterM = !lines[0].bold && lines[0].text.match(/^(调整|觉醒|改动)后[：:]/);
    if (secRaw === 'plain' && afterM && grp.items.length) {
      const last = grp.items[grp.items.length - 1];
      if (last && !last.table && new RegExp(afterM[1] + '前[：:]').test(String(last.d || ''))) {
        last.d = String(last.d).replace(/\s+$/, '') + '\n' +
          lines.map(l => String(l.text).trim()).filter(Boolean).join('\n');
        return;
      }
    }

    pushItems(makeItems(lines, grp.name, chessScope(), false, markNew, guessNames, secRaw));
  });
  walk(host);

  flushFlat();
  flushAdj();

  /* 把「标题其实是条目名」的分组折回条目 */
  foldNameGroups(sections);

  return sections
    .map(s => ({
      name: s.name,
      groups: s.groups
        .filter(g => g.items.length)
        .map(g => ({ name: g.name, items: g.items.map(it => { delete it._cont; delete it._raw; delete it._num; return it; }) }))
    }))
    .filter(s => s.groups.length);
}

