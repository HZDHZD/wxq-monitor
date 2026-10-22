/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* ====================  整篇局内判定  ==================== */
/* 公告没有「核心玩法更新」这种总标题时，靠章节名判断是否整篇都是局内内容 */
const INNER_SEC_RE = /棋手|英雄|天赋|装备|卡牌|效果牌|羁绊|技能|秘技|对局|战斗|数值|机制|商店|经济|等级|棋子|阵容|阵营|模块|符文|平衡|伤害|局内/;
const OUTER_SEC_RE = /系统|问题修复|修复|限时|活动|交易行|好友|钻石|王牌|称号|成就|会员|个人中心|流程|流水|名片|商城|通行证|奖励|赛事|观战|社交|战队|任务|邮件|充值|福利|签到|礼包|局外/;

function stripSecNo(name) {
  return clean(name).replace(/^[一二三四五六七八九十百]+、\s*/, '');
}

/* 分组出现在章节标题之前时，解析器会临时开一个「未分类」章节占位；
   判定和合并时把它当成没有章节名，否则整篇局内公告永远不会被自动合并 */
const PLACEHOLDER_SEC_RE = /^(未分类|其他|其它|正文)$/;

function isCoreName(name) {
  return stripSecNo(name).indexOf('核心玩法') >= 0;
}

function allInnerSections(sections) {
  if (!sections.length) return false;
  /* 原文没有章节标题时，解析结果只是一个空名章节，分组名就是「棋手调整」
     「英雄调整」这类标题：退回用分组名判断是否整篇局内 */
  const names = [];
  sections.forEach(s => {
    const sn = stripSecNo(s.name);
    if (sn && !PLACEHOLDER_SEC_RE.test(sn)) names.push(sn);
    else (s.groups || []).forEach(g => {
      const gn = stripSecNo(g.name);
      if (gn) names.push(gn);
    });
  });
  if (!names.length) return false;
  if (names.some(n => isCoreName(n) || OUTER_SEC_RE.test(n))) return false;
  /* 纯上新公告（章节名全是「…更新」，没有调整语义，如 18891845）：不自动套核心章节 */
  if (names.every(n => /更新$/.test(n))) return false;
  return names.every(n => INNER_SEC_RE.test(n));
}

/* 补一个「一、核心玩法更新」总章节，原章节降为分组，原分组降为三级标签 */
function mergeAsCore(sections) {
  const groups = [];
  sections.forEach(sec => {
    const secName = stripSecNo(sec.name);
    /* 原文本来就没有章节标题（只有「棋手调整」这类分组）：分组名原样保留，
       否则出图侧拿不到「棋手」分组名，棋手卡会全部丢掉立绘 */
    if (!secName || PLACEHOLDER_SEC_RE.test(secName)) {
      sec.groups.forEach(grp => {
        if (grp.items.length) groups.push({ name: clean(grp.name), items: grp.items.slice() });
      });
      return;
    }
    const g = { name: secName, items: [] };
    sec.groups.forEach(grp => {
      const nm = clean(grp.name);
      const list = grp.items.slice();
      if (nm && nm !== clean(sec.name)) {
        /* 分组名一律作为三级标签，正文另起一条：
           即使下面只有一段说明（安琪拉、6级天赋领取逻辑调整），也不能并成标题卡，
           否则它和闹闹/弈星会差一级 */
        list.unshift({ t: nm, d: '', sub: true });
      }
      list.forEach(it => g.items.push(it));
    });
    if (g.items.length) groups.push(g);
  });
  return groups.length ? [{ name: '一、核心玩法更新', groups }] : [];
}

/* 第一章标题统一成「核心玩法更新」，编号沿用原文（没有编号补「一、」）。
   只改本来就写着「核心玩法」的章节名（核心玩法调整 → 核心玩法更新）；
   「英雄调整 / 棋手调整」这类是分组名，不是章节名，按二级标题处理：
   整篇都是局内内容时由下面的合并逻辑套成「一、核心玩法更新 + 分组」，
   不在这里改名 */
function renameFirstChapter(sections) {
  if (!sections || !sections.length) return sections;
  const s0 = sections[0];
  const nm = clean(s0.name || '');
  if (!/核心玩法/.test(nm)) return sections;
  const m = /^([一二三四五六七八九十百]+[、.．]|[0-9]{1,2}[、.．])\s*/.exec(nm);
  /* 不改原数组：切回「合并」时还要按原文名判断，不能被上一次改名污染 */
  const out = sections.slice();
  out[0] = Object.assign({}, s0, { name: (m ? m[1] : '一、') + '核心玩法更新' });
  return out;
}

/* 合并 / 不合并两条路的最终章节 */
function finalSections(sections, merge) {
  return merge ? mergeAsCore(sections) : renameFirstChapter(sections);
}

/* 原文解析结果保留一份，切换合并开关时重新渲染 */
let rawSections = [];
/* 上一次抓取/粘贴的原文与元信息，切换「长句精简」时按新开关重新解析 */
let lastNotice = { html: '', meta: null };

function prepareAndRender(sections, meta) {
  rawSections = sections;
  const bar = $('#scopeBar');
  const canMerge = !noCoreMode && sections.length > 0 && !sections.some(s => isCoreName(s.name));
  bar.hidden = !canMerge;
  if (canMerge) {
    const auto = allInnerSections(sections);
    $('#mergeCore').checked = auto;
    $('#scopeHint').textContent = auto
      ? '原文没有总章节，已自动合并；取消勾选则按原文拆章'
      : '未识别为纯局内公告；勾选可强制合并';
  }
  render(finalSections(sections, canMerge && $('#mergeCore').checked), meta);
}

/* 纯文字 → 伪 HTML */
const GROUP_WORDS = /^(棋手调整|英雄调整|天赋调整|卡牌效果调整|装备调整|效果牌调整|羁绊调整|技能调整|战斗调整|数值调整|机制调整|问题修复|系统更新|限时活动|日常活动|交易行|好友系统|钻石狂潮|王牌对决|目标追求|流程调整|流水查询系统|荣耀会员名片|个人中心|称号系统|成就系统|王中王系统)$/;
function textToHtml(txt) {
  let html = '';
  txt.split(/\r?\n/).map(clean).filter(Boolean).forEach(line => {
    if (/^[一二三四五六七八九十]+、/.test(line)) html += '<h1>' + esc(line) + '</h1>';
    else if (GROUP_WORDS.test(line)) html += '<h2>' + esc(line) + '</h2>';
    else html += '<p>' + esc(line) + '</p>';
  });
  return html;
}

/* ====================  渲染  ==================== */
let totalCount = 0;

function render(sections, meta) {
  curMeta = meta;
  const list = $('#list');

  if (!sections.length) {
    list.innerHTML = '<div class="empty">没有解析到条目。</div>';
    $('#toolbar').classList.remove('on');
    return;
  }

  let html = '';
  totalCount = 0;
  sections.forEach(sec => {
    const n = sec.groups.reduce((a, g) => a + g.items.length, 0);
    totalCount += n;
    html += '<div class="sec" data-name="' + esc(sec.name) + '">';
    /* 整篇没有章节标题时解析出的是空名章节，别渲染成只有「N 条 / 只选本章」的空白栏 */
    if (sec.name) html += '<div class="secHead"><input type="checkbox" class="headCk ckSec" checked>' + esc(sec.name) + '<span class="n">' + n + ' 条</span><button type="button" class="onlySec">只选本章</button></div>';
    sec.groups.forEach(g => {
      html += '<div class="grp" data-name="' + esc(g.name) + '">';
      html += '<div class="grpHead"><input type="checkbox" class="headCk ckGrp" checked>' + esc(g.name) + '</div>';
      g.items.forEach(it => {
        html += '<label class="item">'
          + '<input type="checkbox" class="ck" checked>'
          + '<div class="body">'
          + '<div class="tline">'
          + '<input type="text" class="t" value="' + esc(it.t) + '">'
          + '<label class="subChk" title="作为三级标签渲染（独立胶囊）">'
          + '<input type="checkbox" class="sb"' + (it.sub ? ' checked' : '') + '>三级'
          + '</label>'
          + '</div>'
          + '<textarea class="d" rows="2">' + esc(it.d) + '</textarea>'
          + '</div></label>';
      });
      html += '</div>';
    });
    html += '</div>';
  });

  list.innerHTML = html;
  $('#toolbar').classList.add('on');
  document.querySelectorAll('textarea.d').forEach(autoGrow);
  refreshCount();
  syncHead();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight + 6, 260) + 'px';
}

function refreshCount() {
  const sel = document.querySelectorAll('.item .ck:checked').length;
  $('#count').textContent = '已选 ' + sel + ' / ' + totalCount + ' 条';
}

/* 章节 / 分组复选框：跟随下面条目的勾选状态 */
function syncHead() {
  document.querySelectorAll('.grp').forEach(g => {
    const all = Array.from(g.querySelectorAll('.item .ck'));
    const on = all.filter(c => c.checked).length;
    const cb = g.querySelector('.ckGrp');
    if (!cb) return;
    cb.checked = all.length > 0 && on === all.length;
    cb.indeterminate = on > 0 && on < all.length;
  });
  document.querySelectorAll('.sec').forEach(s => {
    const all = Array.from(s.querySelectorAll('.item .ck'));
    const on = all.filter(c => c.checked).length;
    const cb = s.querySelector('.ckSec');
    if (!cb) return;
    cb.checked = all.length > 0 && on === all.length;
    cb.indeterminate = on > 0 && on < all.length;
  });
}

/* ====================  收集 / 导出  ==================== */
function collect() {
  const sections = [];
  document.querySelectorAll('.sec').forEach(secEl => {
    const sec = { name: secEl.dataset.name, groups: [] };
    secEl.querySelectorAll('.grp').forEach(gEl => {
      const items = [];
      gEl.querySelectorAll('.item').forEach(itEl => {
        if (!itEl.querySelector('.ck').checked) return;
        const t = itEl.querySelector('.t').value.trim();
        const d = itEl.querySelector('.d').value.trim();
        const sub = !!itEl.querySelector('.sb').checked;
        /* 三级标签只画胶囊，说明文字要另起一条，否则会被静默丢掉 */
        if (sub && t) {
          items.push({ t, d: '', sub: true });
          if (d) items.push({ t: '', d });
        }
        else if (t || d) items.push({ t, d });
      });
      if (items.length) sec.groups.push({ name: gEl.dataset.name, items });
    });
    if (sec.groups.length) sections.push(sec);
  });
  return {
    date: curMeta.date,
    server: curMeta.server,
    title: curMeta.title,
    sections
  };
}

/* ====================  导出前把棋手组的技能收成 kids  ==================== */
/* 提炼出来的棋手组是平铺的（棋手、技能、技能…）。出图只能靠「上一条是棋手
   就挂」猜归属，容易把皮肤公告也吞进去。这里在导出 JSON 前按名单收一次：
   1) 技能名在名单里查得到 → 挂给名单里的那位棋手
   2) 组合名（【机枪模式】 · 裂伤弹）拆开分别查，同属一人才挂
   3) 名单没有（本版本新增的技能）→ 挂给该组上一位棋手
   皮肤/商城公告、三级标签、「…调整」结尾的规则标题都不挂 */
const SHOP_NOTICE_RE = /(皮肤|商城|点券|折扣|售卖|限时|礼包|上架)/;
/* 棋手表（LEX.lords）和英雄牌表（LEX.heroes）是分开的两份名单。
   两边会重名（镜、安琪拉…），所以先看分组名是「棋手调整」还是「英雄调整」，
   再用对应那份名单认人，不能靠名字本身猜 */
const LORD_NAME_SET = new Set((((typeof window !== 'undefined' && window.LEX) || {}).lords || []).map(lexNorm));
const HERO_NAME_SET = new Set(Object.keys(((typeof window !== 'undefined' && window.LEX) || {}).heroes || {}).map(lexNorm));
function skillOwner(t) {
  const hit = lexLookup(t);
  if (hit && hit.kind === 'skill') return hit.owner || '';
  const parts = String(t).replace(/[【】]/g, '').split(/[·・]/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  let owner = '';
  for (const p of parts) {
    const h = lexLookup(p);
    if (!h || h.kind !== 'skill') return '';
    if (owner && h.owner !== owner) return '';
    owner = h.owner || owner;
  }
  return owner;
}
/* 「棋手 · 技能」：前半是棋手名时拆开，按「该棋手的卡 + 技能」处理。
   否则这类组合名会走进「新技能」兜底，全被挂到上一位棋手身上 */
function splitLordSkill(t) {
  const m = String(t || '').trim().match(/^(.+?)\s*[·・]\s*(.+)$/);
  if (!m) return null;
  const h = lexLookup(m[1].trim());
  return h && h.kind === 'lord' ? { who: m[1].trim(), skill: m[2].trim() } : null;
}
function nestChessKids(sections) {
  (sections || []).forEach(sec => (sec.groups || []).forEach(g => {
    if (!/(棋手|英雄)调整/.test(g.name || '') || !Array.isArray(g.items)) return;
    /* 棋手和英雄会重名（镜、安琪拉…），按分组名判断是哪一边，再用对应名单认人 */
    const isHeroGroup = /英雄/.test(g.name || '');
    const NAMES = isHeroGroup ? HERO_NAME_SET : LORD_NAME_SET;
    const isAnchor = name => NAMES.has(lexNorm(name));
    const lordAt = new Map();
    g.items.forEach(it => {
      if (!it.t) return;
      if (isAnchor(it.t) && !lordAt.has(lexNorm(it.t))) lordAt.set(lexNorm(it.t), it);
    });
    const out = [];
    let lastLord = null;
    g.items.forEach(it => {
      if (it.sub || !it.t) { out.push(it); return; }
      if (isAnchor(it.t)) {
        it.kids = it.kids || [];
        lordAt.set(lexNorm(it.t), it);
        lastLord = it;
        out.push(it);
        return;
      }
      let target = null;
      /* 技能名单只有棋手的，英雄组不做技能名匹配，直接走「上一位英雄」兜底 */
      const owner = isHeroGroup ? '' : skillOwner(it.t);
      if (owner) target = lordAt.get(lexNorm(owner)) || null;
      if (!owner && !isHeroGroup) {
        const pair = splitLordSkill(it.t);
        if (pair) {
          /* 「棋手 · 技能」：棋手卡还没出现过就地补一张，卡里只留技能名 */
          const key = lexNorm(pair.who);
          target = lordAt.get(key) || null;
          if (!target) {
            target = { t: pair.who, d: '', kids: [] };
            lordAt.set(key, target);
            lastLord = target;
            out.push(target);
          }
          target.kids = target.kids || [];
          target.kids.push({ t: pair.skill, d: it.d || '' });
          return;
        }
      }
      /* 名单里没有的新棋手（新版本才上线）：短名单独成卡并成为后续技能的归属，
         否则它的技能会全部变成散条；已知技能名在上面的 skillOwner 已拦下 */
      if (!target && !owner && it.t.length <= 3
        && !SHOP_NOTICE_RE.test(it.t)
        && !/(调整|更新|修复|说明|优化)$/.test(it.t)
        && !/^[0-9]/.test(it.t)) {
        it.kids = it.kids || [];
        lordAt.set(lexNorm(it.t), it);
        lastLord = it;
        out.push(it);
        return;
      }
      /* 「鬼谷子 先知图腾」：标题开头是另一个已知角色名时，这条属于那个角色，
         不能挂在上一位英雄名下（上一条是苍，挂过去会读成苍的改动） */
      if (!target && !owner) {
        const mSelf = it.t.match(/^(.{2,10}?)[\s·・、]+(.+)$/);
        const who = mSelf && mSelf[1].trim();
        if (who && isAnchor(who) && (!lastLord || lexNorm(lastLord.t) !== lexNorm(who))) {
          const key = lexNorm(who);
          target = lordAt.get(key) || null;
          if (!target) {
            target = { t: who, d: '', kids: [] };
            lordAt.set(key, target);
            out.push(target);
          }
          lastLord = target;
          target.kids = target.kids || [];
          target.kids.push({ t: mSelf[2].trim(), d: it.d || '' });
          return;
        }
      }
      if (!target && lastLord && it.t.length <= 14
        && !SHOP_NOTICE_RE.test(it.t)
        /* 只挡「平衡调整」「系统内容更新」这类分类级说法（短名 + 通用动词），
           具体对象名（某个宝宝的技能、某件装备）不挡，仍挂给上一位棋手 */
        && !/^.{0,6}(调整|更新|修复|说明|优化)$/.test(it.t)
        && !/^[0-9]+级/.test(it.t)) target = lastLord;
      if (target) {
        target.kids = target.kids || [];
        target.kids.push({ t: it.t, d: it.d || '' });
        return;
      }
      out.push(it);
    });
    g.items = out;
  }));
  return sections;
}

/* ====================  第一章 / 后续章节 分流  ==================== */
/* 第一章不需要 AI：走 JSON，直接进出图的第一块。
   第二～五章要挑重点，仍然交给 DeepSeek：走提示词，进出图的第二块。
   两条路各走各的按钮，不再混在一个「追加」里 */
/* 局内 / 局外只按位置切：页面上的第一篇就是第一章，与出图端一致。
   不按名字找「核心玩法」——后面章节名里出现这四个字时会把局外章当成
   第一章导出，真正第一章反而被交给 AI。
   allNames 是页面上全部章节（含未勾选的）：第一章被整体取消勾选时 core
   为空，不再拿第二章顶替 */
function splitCore(sections, allNames) {
  const list = sections || [];
  /* 本篇没有第一章：整篇都是局外章节，全部按第二～五章交给 AI */
  if (noCoreMode) return { core: [], rest: list.slice() };
  const names = (allNames && allNames.length) ? allNames : list.map(s => String(s.name || ''));
  if (!names.length) return { core: [], rest: list.slice() };
  const first = list.find(s => String(s.name || '') === names[0]);
  if (!first) return { core: [], rest: list.slice() };
  return {
    core: [first],
    rest: list.filter(s => s !== first)
  };
}

function allSecNames() {
  return Array.from(document.querySelectorAll('.sec')).map(el => el.dataset.name || '');
}

/* 复制 / 下载 JSON 都只给第一章 */
function firstChapterData() {
  const data = collect();
  nestChessKids(data.sections);
  return Object.assign({}, data, { sections: splitCore(data.sections, allSecNames()).core });
}

function downloadJSON() {
  if (noCoreMode) { setStatus('本篇没有第一章；用「复制后续章节提示词」把整篇交给 AI', 'err'); return; }
  const data = firstChapterData();
  if (!data.sections.length) { setStatus('没有勾选任何条目', 'err'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '第一章.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setStatus('已导出第一章（' + data.sections.length + ' 个章节）', 'ok');
}

async function copyJSON() {
  if (noCoreMode) { setStatus('本篇没有第一章；用「复制后续章节提示词」把整篇交给 AI', 'err'); return; }
  const data = firstChapterData();
  if (!data.sections.length) { setStatus('第一章没有勾选任何条目', 'err'); return; }
  const txt = JSON.stringify(data, null, 2);
  try {
    await navigator.clipboard.writeText(txt);
    setStatus('第一章 JSON 已复制到剪贴板', 'ok');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    setStatus('第一章 JSON 已复制', 'ok');
  }
}

