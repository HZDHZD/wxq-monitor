/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* =======================  渲染主流程  ======================= */
const cv = document.getElementById('cv');

function fitPreview() {
  const stage = document.getElementById('stage');
  const availW = stage.clientWidth - 80;
  const availH = stage.clientHeight - 96;
  const ar = cv.width / cv.height;
  let w = availW, h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  cv.style.width = Math.max(40, Math.floor(w)) + 'px';
  cv.style.height = Math.max(40, Math.floor(h)) + 'px';
}

/* =======================  固定字号 + 自动分页  ======================= */
let fixedScale = 0.66;
let pageIdx = 0;
let pagesCache = [];

/* sections → 有序单元：章节头 / 分组头 / 条目（空条目忽略） */
function flattenUnits(sections, hideFirstBar) {
  const units = [];
  (sections || []).forEach((sec, si) => {
    const secName = sec.name || '';
    /* 第一章（核心玩法更新）不画章节标题条：整篇就这一章，标题没有信息量，
       直接从第一个分组（棋手调整 / 英雄调整…）开始。章节名仍保留在数据里，
       分套、续页归属照旧靠它。
       只对所在这一套的第一位生效，不按名字全文匹配——否则后面章节名里
       出现「核心玩法」字样时会被误吞标题条 */
    if (!(si === 0 && hideFirstBar)) units.push({ kind: 'sec', name: secName, secName });
    (sec.groups || []).forEach(grp => {
      const grpName = grp.name || '';
      units.push({ kind: 'grp', name: grpName, secName, grpName });
      (grp.items || []).forEach(it => {
        if (!String(it.t || '').trim() && !String(it.d || '').trim()
            && !(Array.isArray(it.kids) && it.kids.length)) return;
        units.push({ kind: 'item', it, secName, grpName });
      });
    });
  });
  return units;
}

/* 单元切片 → 单页 cfg；页首缺章节/分组头时直接补原名称，不加「（续）」 */
function buildPageCfg(base, slice, noTitle) {
  const sections = [];
  let curSec = null, curGrp = null;
  /* cont：这一页不是从章节开头开始，续页不再重复画章节标题条 */
  const openSec = (name, cont) => {
    curSec = { name: (name || ''), cont: !!cont, groups: [] };
    sections.push(curSec);
    curGrp = null;
  };
  const openGrp = (name) => {
    curGrp = { name: (name || ''), items: [] };
    curSec.groups.push(curGrp);
  };
  slice.forEach(u => {
    if (u.kind === 'sec') { openSec(u.name, false); return; }
    if (u.kind === 'grp') {
      if (!curSec) openSec(u.secName, true);
      openGrp(u.name);
      return;
    }
    if (!curGrp) {
      if (!curSec) openSec(u.secName, true);
      openGrp(u.grpName);
    }
    curGrp.items.push(u.it);
  });
  /* 兜底：分组头后面没有条目时不要画出来（页尾孤立「王牌对决」这类问题） */
  sections.forEach(s => { s.groups = s.groups.filter(g => (g.items || []).length); });
  return Object.assign({}, base, { sections: sections.filter(s => s.groups.length), noTitle: !!noTitle });
}

/* 单条内容高于整页时，按句读把描述切成多段，跨页显示 */
function splitDescForPaging(text) {
  const s = String(text || '');
  const out = [];
  let buf = '', depth = 0;
  for (const ch of s) {
    if ('（(【「'.includes(ch)) depth++;
    else if ('）)】」'.includes(ch) && depth) depth--;
    buf += ch;
    if (depth === 0 && /[；;。！？!?，,]/.test(ch)) { out.push(buf); buf = ''; }
  }
  if (buf) out.push(buf);
  return out.length ? out : [s];
}

/* 二分查找每页能放下的最多单元数；页尾不留孤立的章节/分组标题 */
function paginate(base, units, scale, painter, ctx, startNo = 0) {
  const pages = [];
  /* 下面会就地 splice 插入续段，复制一份避免改到调用方传进来的数组 */
  units = units.slice();
  let i = 0;
  let pageNo = startNo;
  while (i < units.length) {
    const fitSlice = slice => {
      const cfg = buildPageCfg(base, slice, pageNo > 0);
      const r = painter(ctx, cfg, scale, 0);
      return (r.bottom - r.top) <= (r.safe - r.top);
    };
    const fits = n => fitSlice(units.slice(i, i + n));
    /* 把表格按行切成两段；前段沿用原「续」标记，后段标为续表 */
    const cutTable = (u, k) => {
      const tb = u.it.table, rows = tb.rows || [];
      if (k < 1 || k >= rows.length) return null;
      const mk = (from, to, cont) => Object.assign({}, u, {
        it: Object.assign({}, u.it, {
          tblCont: cont || !!u.it.tblCont,
          table: { head: tb.head, rows: rows.slice(from, to) }
        })
      });
      return [mk(0, k, false), mk(k, rows.length, true)];
    };
    /* 在已有内容后面尽量多塞几行表格，剩下的留给下一页 */
    const splitAfter = (baseSlice, u) => {
      const rows = (u && u.it && u.it.table && u.it.table.rows) || [];
      for (let k = rows.length - 1; k >= 1; k--) {
        const parts = cutTable(u, k);
        if (parts && fitSlice(baseSlice.concat([parts[0]]))) return parts;
      }
      return null;
    };
    /* 整页都放不下的大条目（棋手卡 / 长文）：切成「本页头段 + 下一页续段」。
       带 kids 的棋手卡优先在技能边界切；单个技能也放不下时再把它的正文按句读切开。
       续段标题保留棋手名 +「（续）」，portraitKey 能查到立绘，续页继续画图 */
    const contName = s => {
      const str = String(s || '').trim();
      return /[（(]\s*续\s*[)）]\s*$/.test(str) ? str : str + '（续）';
    };
    const splitOversize = (baseSlice, u) => {
      const it = u && u.it;
      if (!it || it.table) return null;
      const kids = Array.isArray(it.kids) ? it.kids : [];
      if (kids.length) {
        for (let k = kids.length - 1; k >= 1; k--) {
          const headIt = Object.assign({}, it, { kids: kids.slice(0, k), splitHead: true });
          if (!fitSlice(baseSlice.concat([Object.assign({}, u, { it: headIt })]))) continue;
          const tailIt = Object.assign({}, it, {
            t: contName(it.t), d: '', kids: kids.slice(k), splitTail: true
          });
          return [Object.assign({}, u, { it: headIt }), Object.assign({}, u, { it: tailIt })];
        }
        /* 第一个技能自身就超页：拆它的正文，后半段标「（续）」 */
        const first = kids[0];
        const pieces = splitDescForPaging(first.d);
        for (let k = pieces.length - 1; k >= 1; k--) {
          const headIt = Object.assign({}, it, {
            kids: [Object.assign({}, first, { d: pieces.slice(0, k).join('') })],
            splitHead: true
          });
          if (!fitSlice(baseSlice.concat([Object.assign({}, u, { it: headIt })]))) continue;
          const tailIt = Object.assign({}, it, {
            t: contName(it.t), d: '',
            kids: [Object.assign({}, first, { t: contName(first.t), d: pieces.slice(k).join('') })]
              .concat(kids.slice(1)),
            splitTail: true
          });
          return [Object.assign({}, u, { it: headIt }), Object.assign({}, u, { it: tailIt })];
        }
        return null;
      }
      if (it.sub || !String(it.t || '').trim()) return null;
      const pieces = splitDescForPaging(it.d);
      for (let k = pieces.length - 1; k >= 1; k--) {
        const headIt = Object.assign({}, it, { d: pieces.slice(0, k).join(''), splitHead: true });
        if (!fitSlice(baseSlice.concat([Object.assign({}, u, { it: headIt })]))) continue;
        const tailIt = Object.assign({}, it, {
          t: contName(it.t), d: pieces.slice(k).join(''), splitTail: true
        });
        return [Object.assign({}, u, { it: headIt }), Object.assign({}, u, { it: tailIt })];
      }
      return null;
    };
    /* 长文条目（香香这种整页大的棋手卡）当前页放不下时，按句读把正文切开：
       前段填满这一页，后段标「（续）」接到下一页，避免上一页留一大片空白。
       带技能子条目的棋手卡同样在技能边界切，先填满当前页；
       只有连「标题 + 第一段」都放不下时才整张挪到下一页 */
    /* 只有棋手卡能带「（续）」：其余条目宁可整条挪到下一页，也不拆成半句 */
    const canContinue = u => {
      const it = u && u.it;
      if (!it) return false;
      return (Array.isArray(it.kids) && it.kids.length > 0)
        || isChessName(it.t) || /棋手/.test(u.grpName || '');
    };
    const splitTextAfter = (baseSlice, u) => {
      const it = u && u.it;
      if (!it || it.table) return null;
      if (Array.isArray(it.kids) && it.kids.length) {
        return splitOversize(baseSlice, u);
      }
      if (it.sub || !String(it.t || '').trim()) return null;
      if (!canContinue(u)) return null;
      const pieces = splitDescForPaging(it.d);
      /* 前后都至少留两段，避免把一句话拆成孤零零的尾巴 */
      for (let k = pieces.length - 2; k >= 2; k--) {
        const head = Object.assign({}, u, {
          it: Object.assign({}, it, { d: pieces.slice(0, k).join(''), splitHead: true })
        });
        if (fitSlice(baseSlice.concat([head]))) {
          const tail = Object.assign({}, u, {
            it: Object.assign({}, it, {
              t: contName(it.t),
              d: pieces.slice(k).join(''),
              splitTail: true
            })
          });
          return [head, tail];
        }
      }
      return null;
    };
    let lo = 1, hi = units.length - i, best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(mid)) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    /* 当前页起首的表格整张放不下：按行切，先把这一页填满，剩下的标续表 */
    if (best === 1 && !fits(1) && units[i].kind === 'item' && units[i].it && units[i].it.table) {
      const parts = splitAfter([], units[i]);
      if (parts) {
        units.splice(i, 1, parts[0], parts[1]);
        continue;
      }
    }
    /* 一条就撑破整页：切开，让内容自然续到下一页，而不是溢出画布。
       棋手卡在技能边界拆，续页保留棋手名 +「（续）」，立绘继续画 */
    if (best === 1 && !fits(1) && units[i].kind === 'item') {
      const parts = splitOversize([], units[i]);
      if (parts) {
        units.splice(i, 1, parts[0], parts[1]);
        continue;
      }
    }
    let take = Math.max(1, best);
    /* 下一页开头是表格、这一页还剩空间：先拆几行上来填满，剩下的标「（续）」 */
    if (i + take < units.length) {
      const nxt = units[i + take];
      if (nxt && nxt.kind === 'item' && nxt.it && nxt.it.table) {
        const parts = splitAfter(units.slice(i, i + take), nxt);
        if (parts) {
          units.splice(i + take, 1, parts[0], parts[1]);
          take += 1;
        }
      } else if (nxt && nxt.kind === 'item') {
        const parts = splitTextAfter(units.slice(i, i + take), nxt);
        if (parts) {
          units.splice(i + take, 1, parts[0], parts[1]);
          take += 1;
        }
      }
    }
    if (i + take < units.length) {
      /* 回退到稳定：页尾不能是章节头/分组头，也不能是子标题（○ 说明）或只有标题的条目。
         标题常常连着出现（章节头 + 分组头），必须一直退到条目为止：只退一步会把
         自己留成章节头，它没有条目、在 buildPageCfg 里被整块过滤掉，下一页又以
         「续页」身份出现，章节条就再也不画了（标题丢失）。
         整页只剩标题时保持原样：继续退只会把每页拆成一条，页数暴涨 */
      const badEnd = u => {
        if (!u || u.kind !== 'item') return true;
        const it = u.it || {};
        if (it.sub) return true;
        if (it.table || (Array.isArray(it.kids) && it.kids.length)) return false;
        return !!(String(it.t || '').trim() && !String(it.d || '').trim());
      };
      let k = take;
      while (k > 1 && badEnd(units[i + k - 1])) k--;
      if (k > 1) take = k;
    }
    pages.push(units.slice(i, i + take));
    i += take;
    pageNo++;
  }
  return pages;
}

/* 尾页过空时，只从上一页尾部搬少量条目过去，前面的页保持排满。
   不做「最后两页等高」：那会把本来排满的倒数第二页一起摊薄，出现整页下半截空白 */
function paginateBalanced(base, units, scale, painter, ctx, startNo = 0) {
  const greedy = paginate(base, units, scale, painter, ctx, startNo);
  const n = greedy.length;
  if (n < 2) return greedy;

  const probe = (slice, noTitle) => {
    const r = painter(ctx, buildPageCfg(base, slice, noTitle), scale, 0);
    return { h: r.bottom - r.top, cap: r.safe - r.top };
  };
  const capB = probe([], true).cap;
  /* 尾页达到 30% 容量就算正常，保持贪心结果 */
  if (probe(greedy[n - 1], true).h >= capB * 0.3) return greedy;

  /* 页尾不能落在章节头/分组头/子标题/只有标题的条目上 */
  const canEnd = (u) => {
    if (!u || u.kind !== 'item') return false;
    const it = u.it || {};
    if (it.sub) return false;
    if (it.table) return true;
    if (Array.isArray(it.kids) && it.kids.length) return true;
    return !(String(it.t || '').trim() && !String(it.d || '').trim());
  };
  const prev = greedy[n - 2];
  const last = greedy[n - 1];
  const noTitlePrev = startNo + n - 2 > 0;
  const capA = probe([], noTitlePrev).cap;
  /* 从上一页尾部搬 m 条到尾页，取两页填充率中较低者最大的方案：
     尾页不至于只剩一小块，上一页也不会被摊得太空。
     上一页低于 40% 或尾页溢出时停止（m 再大只会更糟） */
  let best = null, bestFill = 0.3;
  for (let m = 1; m < prev.length; m++) {
    const a = prev.slice(0, prev.length - m);
    if (!canEnd(a[a.length - 1])) continue;
    const ha = probe(a, noTitlePrev).h;
    if (ha < capA * 0.4) break;
    const b = prev.slice(prev.length - m).concat(last);
    const hb = probe(b, true).h;
    if (hb > capB) break;
    const fill = Math.min(ha / capA, hb / capB);
    if (fill > bestFill) { bestFill = fill; best = [a, b]; }
  }
  return best ? greedy.slice(0, n - 2).concat([best[0], best[1]]) : greedy;
}

function pageTopY(size) {
  return Math.round(Math.min(size.w, size.h) * 0.075) + Math.round(size.h * (size.reserveT || 0));
}

/* 拆页，并给每页算出可用区内的垂直居中补白 */
function buildPages(ctx, base, scale, painter) {
  const units = flattenUnits(base.sections, base.hideFirstBar);
  /* 整篇连续分页：章节不强制另起一页，上一章放得下就接着排，少留空白 */
  const slices0 = units.length ? paginateBalanced(base, units, scale, painter, ctx, 0) : [[]];
  /* 只剩章节头 / 分组头、没有条目的页不能出：首页顶栏占位时第一条会被挤到下一页，
     标题就此单独成页（导出就是一张空白内容页）。把标题带到下一页，
     让它跟着第一条一起出现 */
  const slices = [];
  let carry = [];
  slices0.forEach(sl => {
    const s = carry.concat(sl);
    if (!s.some(u => u.kind === 'item')) { carry = s; return; }
    slices.push(s);
    carry = [];
  });
  if (!slices.length) slices.push([]);
  const pages = slices.map((slice, idx) => {
    const cfg = buildPageCfg(base, slice, idx > 0);
    const probe = painter(ctx, cfg, scale, 0);
    /* 填充率：正文实际高度 / 内容可用高度，用于「每套至少三页、末页不空」的判定 */
    const fill = probe.safe > probe.top ? (probe.bottom - probe.top) / (probe.safe - probe.top) : 1;
    return { cfg, offset: 0, scale, fill, h: probe.cardH || 0, top: probe.top || 0 };
  });
  /* 不管底部遮挡：卡片直接撑到页面下边距，多页底边统一对齐 */
  const bottomEdge = base.H - Math.round(Math.min(base.W, base.H) * 0.037);
  pages.forEach(p => { p.cfg.cardH = Math.max(0, bottomEdge - p.top); delete p.h; delete p.top; });
  return pages;
}

/* 每套（不含封面）固定三页：字号从用户设定值往上试，找到「前两页排满、末页至少 30%」
   的第一档就用它——不为了把最后一页也塞满而继续放大。
   判据：仍为三页、内容不溢出、除末页外每页 ≥ 90%、末页 ≥ 30%。
   没有一档同时满足时，取「前两页填充率里较低的那页最高」的档位（末页仍需 ≥30%）；
   这样至少不会为了末页把前面的页撑空。到 300% 仍凑不满三页则保持用户字号。
   放大到某档时允许棋手卡拆成「（续）」跨页，但优先选不拆卡的档位 */
/* 上次选中的字号：改几个字时先用它排一遍，合格就直接用。
   不缓存的话每次都要从用户字号到 300% 二分十几轮，每轮都是整篇重排，
   长文档打一个字要卡一秒。base 记下用户字号，换档位自动失效 */
const fitMemo = Object.create(null);

function fitSetPages(ctx, base, painter, scale, memoKey) {
  const MAX = 3, LIMIT = 3;
  const build = sc => buildPages(ctx, base, sc, painter);
  /* 内容溢出内容区：这档字号撑破版式 */
  const overflow = arr => arr.some(p => p.fill > 1.02);
  const hasSplit = arr => arr.some(p => (p.cfg.sections || []).some(sec =>
    (sec.groups || []).some(g => (g.items || []).some(it =>
      it.splitHead || it.splitTail || it.tblCont))));
  const lastOk = arr => arr.length === MAX && !overflow(arr) && arr[MAX - 1].fill >= 0.30;
  const fullOk = arr => arr.slice(0, -1).every(p => p.fill >= 0.90);
  const memo = memoKey ? fitMemo[memoKey] : null;
  if (memo && memo.base === scale) {
    if (memo.mode === 'fit') {
      const pgs = build(memo.scale);
      /* 仍排成三页、不溢出、末页不空：就沿用上次的字号，不重找
         （不要求前两页 ≥90%：上次就是从「最均衡」那档选出来的，改几个字不该让字号跳档） */
      if (pgs.length === MAX && !overflow(pgs) && lastOk(pgs) && !hasSplit(pgs)) return pgs;
      /* 内容改到这套字号不再合格：落到下面重新找档位 */
    } else {
      const pgs = build(scale);
      /* 页数仍超上限、或本来就凑不满三页：直接用用户字号。
         页数掉回三页以内说明内容删减了，下面重新走一遍完整搜索，字号还能自动放上去 */
      if (pgs.length > MAX || memo.mode === 'nofit') return pgs;
    }
  }
  const pages0 = build(scale);
  if (!flattenUnits(base.sections, base.hideFirstBar).length) return pages0;
  if (pages0.length > MAX) {
    if (memoKey) fitMemo[memoKey] = { base: scale, mode: 'over' };
    return pages0;
  }
  /* 前两页里填充率较低的那页，用来在都不达标时挑最均衡的档位 */
  const balance = arr => Math.min.apply(null, arr.slice(0, -1).map(p => p.fill));

  /* ① 字号越大页数越多：二分定位「不超三页」的字号上界，
     避免从用户字号一档档试到 300%（内容刚好两三页时要试两百多轮，每次都要全量排版） */
  const p0 = Math.round(scale * 100), pEnd = Math.round(LIMIT * 100);
  const cache = new Map();
  const at = p => {
    if (p === p0) return pages0;
    if (!cache.has(p)) cache.set(p, build(p / 100));
    return cache.get(p);
  };
  let lo = p0, hi = pEnd, top = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (at(mid).length <= MAX) { top = mid; lo = mid + 1; } else hi = mid - 1;
  }
  /* 最高档都凑不满三页：不会有任何一档满足 lastOk，保持用户字号 */
  if (top < 0 || at(top).length < MAX) { if (memoKey) fitMemo[memoKey] = { base: scale, mode: 'nofit' }; return pages0; }

  let hit = null, hitSc = 0;
  let best = null, bestSc = 0, bestBal = -1;
  /* ② 在上界内二分找第一个「前两页排满、末页至少 30%」的档（等价于原来的逐档找首个命中） */
  let a = p0, b = top, found = -1;
  while (a <= b) {
    const mid = (a + b) >> 1;
    const pgs = at(mid);
    if (lastOk(pgs) && fullOk(pgs)) { found = mid; b = mid - 1; } else a = mid + 1;
  }
  if (found >= 0) {
    hit = at(found); hitSc = found / 100;
  } else {
    /* ③ 没有整档命中：从上界往下取「前两页较低那页最满」的档 */
    for (let p = top; p >= Math.max(p0, top - 20); p--) {
      const pgs = at(p);
      if (!lastOk(pgs)) continue;
      const bal = balance(pgs);
      if (bal > bestBal + 1e-9) { best = pgs; bestSc = p / 100; bestBal = bal; }
    }
  }
  if (!hit && !best) { if (memoKey) fitMemo[memoKey] = { base: scale, mode: 'nofit' }; return pages0; }

  const pick = hit || best;
  const pickSc = hit ? hitSc : bestSc;

  /* ② 选中的档位要拆棋手卡时，往下最多退 8% 找不拆卡的档位 */
  if (hasSplit(pick)) {
    for (let d = 1; d <= 8; d++) {
      const sc = Math.round((pickSc - d * 0.01) * 100) / 100;
      if (sc < scale) break;
      const pgs = build(sc);
      if (pgs.length === MAX && !overflow(pgs) && !hasSplit(pgs) && pgs[MAX - 1].fill >= 0.30) {
        if (memoKey) fitMemo[memoKey] = { base: scale, mode: 'fit', scale: sc };
        return pgs;
      }
    }
  }
  if (memoKey) fitMemo[memoKey] = { base: scale, mode: 'fit', scale: pickSc };
  return pick;
}

function paintPage(ctx, i) {
  const pg = pagesCache[i];
  if (pg && pg.cover) { paintCover(ctx, pg.cfg); return; }
  paintSunset(ctx, pg.cfg, pg.scale || fixedScale, pg.offset);
}

/* 套内章节序号：每套各自从「一、」开始，第二套不会顶着「二、」开场 */
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
function renumberSec(name, n) {
  const s = String(name || '');
  const m = s.match(/^(\s*)([一二三四五六七八九十百]+|\d+)(\s*[、.．:：]\s*)/);
  if (!m) return s;
  const cn = !/\d/.test(m[2]) && n <= 20;
  return m[1] + (cn ? CN_NUM[n] : String(n)) + m[3] + s.slice(m[0].length);
}

/* 篇主题 → 内容页顶栏副标题：正式服更新 · 局内平衡篇 */
function setSub(base, name) {
  const server = String(base.server || '').trim();
  return server ? `${server}更新 · ${name}` : name;
}

/* 输入时防抖：先只重绘当前页（几毫秒），整篇重排等停手再做。
   长公告一次全量分页要三四百毫秒，每停顿一下就整篇重排会明显卡；
   当前页重绘用的是上次的分页结果，改动没超出这一页时看起来就是实时的 */
let renderTimer = 0;
const RENDER_DELAY = 600;
function scheduleRender() {
  clearTimeout(renderTimer);
  repaintCurrent();
  renderTimer = setTimeout(() => { render(); }, RENDER_DELAY);
}

/* 只重画正在看的那一页，不动分页 */
function repaintCurrent() {
  if (!pagesCache.length) return;
  paintPage(cv.getContext('2d'), Math.min(Math.max(pageIdx, 0), pagesCache.length - 1));
}

function render() {
  clearTimeout(renderTimer);
  renderTimer = 0;
  const size = SIZE;
  const W = size.w, H = size.h;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  const base = {
    W, H,
    reserveT: size.reserveT || 0,
    reserveR: size.reserveR || 0,
    reserveB: size.reserveB || 0,
    date: state.date,
    server: state.server,
    title: state.title.trim() || '（未填写标题）',
    sub: state.sub.trim(),
    foot: state.foot.trim(),
    sections: state.sections
  };

  // 固定字号，放不下就自动拆成多张；封面固定作为第 1 张
  /* 编辑侧分成了局内 / 局外：预览与导出都只出当前标签这一篇，各自带封面、页码从 1 起。
     关掉「分套」时退回老做法：全部章节当一篇排 */
  const partName = state.part === 'in' ? '局内平衡篇' : '局外更新篇';
  const partList = state.part === 'in' ? state.sections.slice(0, 1) : state.sections.slice(1);
  /* 第一章的标题条什么时候不画：名称含「核心玩法」，或者整篇没有章节名（体验服常见）。
     这个判断只作用在第一位，局外那套的第一条其实是第二章，照常画 */
  const firstSec = state.sections[0];
  const firstBarless = !!firstSec && (!String(firstSec.name || '').trim() || isCoreSec(firstSec));
  if (state.split) {
    /* 篇内章节序号各自从「一、」重排 */
    const b = Object.assign({}, base, {
      sections: partList.map((sec, i) => Object.assign({}, sec, { name: renumberSec(sec.name, i + 1) })),
      sub: setSub(base, partName),
      theme: partName,
      hideFirstBar: state.part === 'in' && firstBarless
    });
    /* 这一篇还没有内容时只出封面，不排一张空白内容页 */
    pagesCache = [{ cover: true, cfg: b }].concat(
      flattenUnits(b.sections, b.hideFirstBar).length ? fitSetPages(ctx, b, paintSunset, fixedScale, partName) : []);
    pagesCache.forEach((pg, j) => { pg.setName = partName; pg.setIndex = j; });
  } else {
    /* 不分套：第一章标题已隐藏，后面的章节跟着从「一、」重排，
       避免正文里顶着「二、系统内容更新」开场；第一章不是核心章节时仍从「一、」起 */
    const firstIsCore = isCoreSec(base.sections[0]);
    const b = Object.assign({}, base, {
      sections: base.sections.map((sec, i) => {
        /* 第一章本身不参与重排（它的标题不画，别重排成「零、」） */
        if (firstIsCore && i === 0) return sec;
        return Object.assign({}, sec, { name: renumberSec(sec.name, firstIsCore ? i : i + 1) });
      }),
      hideFirstBar: firstBarless
    });
    pagesCache = [{ cover: true, cfg: b }].concat(fitSetPages(ctx, b, paintSunset, fixedScale, 'all'));
  }
  if (pageIdx > pagesCache.length - 1) pageIdx = pagesCache.length - 1;
  if (pageIdx < 0) pageIdx = 0;

  paintPage(ctx, pageIdx);

  // 预览层标出平台 UI 遮挡区（顶 / 右 / 底，不参与导出）
  const guides = [
    ['sgT', ((size.reserveT || 0) * 100).toFixed(2) + '%'],
    ['sgR', ((size.reserveR || 0) * 100).toFixed(2) + '%'],
    ['sgB', ((size.reserveB || 0) * 100).toFixed(2) + '%']
  ];
  guides.forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (id === 'sgR') el.style.width = v; else el.style.height = v;
    el.style.display = parseFloat(v) > 0 ? 'flex' : 'none';
  });

  /* 显示实际生效字号（不是输入框里的基准字号） */
  const pctOf = p => Math.round((p.scale || fixedScale) * 100);
  const curPg = pagesCache.find(p => !p.cover && p.scale);
  const scaleText = curPg ? `${pctOf(curPg)}%` : `${Math.round(fixedScale * 100)}%`;
  document.getElementById('stageInfo').textContent =
    `${size.name} · ${W}×${H} · ${state.split ? partName + ' · ' : ''}实际字号 ${scaleText} · 共 ${pagesCache.length} 张（含封面）`;

  syncPager();
  fitPreview();
}

function syncPager() {
  const pager = document.getElementById('pager');
  pager.classList.toggle('on', pagesCache.length > 1);
  document.getElementById('pgInfo').textContent = `${pageIdx + 1} / ${pagesCache.length}`;
  document.getElementById('pgPrev').disabled = pageIdx <= 0;
  document.getElementById('pgNext').disabled = pageIdx >= pagesCache.length - 1;
}

/* 翻页只重画当前页：不重新分页、不重新找字号 */
function showPage(i) {
  if (!pagesCache.length) return;
  pageIdx = Math.max(0, Math.min(i, pagesCache.length - 1));
  paintPage(cv.getContext('2d'), pageIdx);
  syncPager();
}

window.addEventListener('resize', fitPreview);

