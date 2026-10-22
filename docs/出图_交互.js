/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* =======================  交互绑定  ======================= */
const elMonth = document.getElementById('fMonth');
const elDay = document.getElementById('fDay');
const elServer = document.getElementById('fServer');
const elFoot = document.getElementById('fFoot');
const elSplit = document.getElementById('fSplit');
const elSections = document.getElementById('sections');

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 名字里有没有「核心玩法」：只用于判断第一位的标题条要不要画、以及导入时识别
   整篇公告顺带粘进来的第一章。局内 / 局外归属只看位置，不看名字 */
function isCoreSec(sec) {
  return !!(sec && String(sec.name || '').replace(/\s/g, '').includes('核心玩法'));
}

/* 折叠状态：以章节 / 分组对象为键，重建编辑器后依然保持；不写入导出数据 */
const folded = new WeakSet();

/* 说明类文本框随内容自动撑高，手动换行插在哪一行一眼能看到 */
function autoGrow(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = Math.min(320, el.scrollHeight + 2) + 'px';
}

function buildEditor() {
  elSections.innerHTML = '';
  state.sections.forEach((sec, si) => {
    const box = document.createElement('div');
    const lockSec = si === 0;
    const secFold = folded.has(sec);
    box.className = 'secBox' + (secFold ? ' folded' : '');
    box.innerHTML = `
      <div class="secHead">
        <button class="fold" data-act="foldSec" title="${secFold ? '展开本章' : '折叠本章，只留标题便于换位'}">${secFold ? '▸' : '▾'}</button>
        <span class="grip${lockSec ? ' lock' : ''}" title="${lockSec ? '第一章固定第一位，不可拖动' : '按住标题栏拖动换位'}">${lockSec ? '🔒' : '⠿'}</span>
        <span class="tag">章节${si === 0 ? 1 : si}</span>
        <input type="text" class="secName" placeholder="如：一、核心玩法更新" value="${esc(sec.name)}">
        <button class="mv" data-act="upSec" title="上移"${si <= 1 ? ' disabled' : ''}>▲</button>
        <button class="mv" data-act="downSec" title="下移"${si === 0 ? ' disabled' : ''}>▼</button>
        <button class="iconBtn" data-act="delSec" title="${si === 0 ? '第一章固定第一位，不能删除；清空内容即可' : '删除章节'}"${si === 0 ? ' disabled' : ''}>✕</button>
      </div>
      <div class="secBody"${secFold ? ' style="display:none"' : ''}></div>`;
    const body = box.querySelector('.secBody');
    elSections.appendChild(box);
    /* 折叠时整棵子树不构建，长文档也不会卡 */
    if (secFold) return;

    (sec.groups || []).forEach((grp, gi) => {
      const gbox = document.createElement('div');
      const grpFold = folded.has(grp);
      gbox.className = 'grpBox' + (grpFold ? ' folded' : '');
      gbox.innerHTML = `
        <div class="grpHead">
          <button class="fold" data-act="foldGrp" title="${grpFold ? '展开本组' : '折叠本组'}">${grpFold ? '▸' : '▾'}</button>
          <span class="grip" title="按住标题栏拖动换位">⠿</span>
          <span class="tag">分组</span>
          <input type="text" class="grpName" placeholder="如：棋手调整" value="${esc(grp.name)}">
          <button class="mv" data-act="upGrp" title="上移">▲</button>
          <button class="mv" data-act="downGrp" title="下移">▼</button>
          <button class="iconBtn" data-act="delGrp" title="删除分组">✕</button>
        </div>
        <div class="grpBody"${grpFold ? ' style="display:none"' : ''}></div>`;
      body.appendChild(gbox);
      if (grpFold) return;

      const gbody = gbox.querySelector('.grpBody');

      (grp.items || []).forEach((it, ii) => {
        const row = document.createElement('div');
        row.className = 'itemRow';
        const kids = Array.isArray(it.kids) ? it.kids : [];
        /* 棋手组里的条目都允许挂技能；技能本身没有拖拽手柄，只能跟着棋手整体移动 */
        const canKid = kids.length || isChessName(it.t) || /棋手/.test(grp.name || '');
        const kidHtml = kids.map(k => `
          <div class="kidRow">
            <span class="kidTag">技能</span>
            <div class="kidMain">
              <input type="text" class="kt" placeholder="技能名，如：梦幻引擎" value="${esc(k.t)}">
              <textarea class="kd" rows="2" placeholder="技能说明（Enter 换行）">${esc(k.d)}</textarea>
            </div>
            <div class="kidOps">
              <button class="mv" data-act="upKid" title="上移">▲</button>
              <button class="mv" data-act="downKid" title="下移">▼</button>
              <button class="iconBtn" data-act="delKid" title="删除技能">✕</button>
            </div>
          </div>`).join('');
        row.innerHTML = `
          <div class="no grip" title="按住卡片拖动换位">${ii + 1}</div>
          <div class="mvCol">
            <button class="mv" data-act="upItem" title="上移">▲</button>
            <button class="mv" data-act="downItem" title="下移">▼</button>
          </div>
          <button class="del" data-act="delItem" title="删除">✕</button>
          <div class="inner">
            <div class="field"><input type="text" class="it" placeholder="小标题，如：庄小鱼" value="${esc(it.t)}"></div>
            ${it.table
              ? `<div class="field"><textarea class="itbl" rows="${Math.max(3, (it.table.rows || []).length + 1)}" placeholder="每行：名称 | 调整前 | 调整后">${esc((it.table.rows || []).map(r => r.join(' | ')).join('\n'))}</textarea></div>`
              : `<div class="field"><textarea class="id" rows="2" placeholder="一句话说明（Enter 换行）">${esc(it.d)}</textarea></div>`}
            ${canKid ? `<div class="kidBox">${kidHtml}<button class="miniAdd kidAdd" data-act="addKid">+ 添加技能</button></div>` : ''}
          </div>`;
        gbody.appendChild(row);
      });

      const addIt = document.createElement('button');
      addIt.className = 'miniAdd';
      addIt.textContent = '+ 添加条目';
      addIt.dataset.act = 'addItem';
      gbody.appendChild(addIt);
    });

    const addGrp = document.createElement('button');
    addGrp.className = 'miniAdd';
    addGrp.textContent = '+ 添加分组';
    addGrp.dataset.act = 'addGrp';
    body.appendChild(addGrp);
  });

  elSections.querySelectorAll('textarea').forEach(autoGrow);

  const fa = document.getElementById('btnFoldAll');
  if (fa) {
    const allFolded = state.sections.length > 0 && state.sections.every(s => folded.has(s));
    fa.textContent = allFolded ? '全部展开' : '全部折叠';
  }

  applyPartFilter();
}

/* 只切显示，不重建 DOM：切标签时不必重排整棵编辑器（文档长时重建会明显卡） */
function applyPartFilter() {
  [...elSections.children].forEach((box, i) => {
    box.style.display = (i === 0) === (state.part === 'in') ? '' : 'none';
  });
  syncPartUI();
}

/* 编辑侧标签：只控制显示哪一块导入框和「+ 添加章节」，
   局内固定只有第一章，新增章节一律进局外 */
function syncPartUI() {
  const inner = state.part === 'in';
  document.querySelectorAll('#fPart button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === state.part);
  });
  document.getElementById('grpImport1').style.display = inner ? '' : 'none';
  document.getElementById('grpImport2').style.display = inner ? 'none' : '';
  document.getElementById('btnAddSec').style.display = inner ? 'none' : '';
}

document.getElementById('fPart').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (!b || b.dataset.v === state.part) return;
  state.part = b.dataset.v;
  pageIdx = 0;      /* 换篇后预览从封面重新看 */
  applyPartFilter();
  render();
});

/* 第一章固定第一位：锁定状态与名称无关，改名也保持🔒 */
function refreshSecLock() {
  [...elSections.children].forEach((box, i) => {
    const g = box.querySelector(':scope > .secHead > .grip'); if (!g) return;
    const lock = i === 0;
    g.textContent = lock ? '🔒' : '⠿';
    g.classList.toggle('lock', lock);
    g.title = lock ? '第一章固定第一位，不可拖动' : '按住标题栏拖动换位';
  });
}

/* 输入：事件委托，避免重绘丢焦点 */
elSections.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('textarea.id, textarea.kd, textarea.itbl')) autoGrow(t);
  const sec = t.closest('.secBox'); if (!sec) return;
  const si = [...elSections.children].indexOf(sec);
  if (si < 0) return;
  if (t.classList.contains('secName')) { state.sections[si].name = t.value; refreshSecLock(); scheduleRender(); return; }
  const grp = t.closest('.grpBox'); if (!grp) return;
  const gi = [...sec.querySelectorAll(':scope > .secBody > .grpBox')].indexOf(grp);
  if (gi < 0) return;
  if (t.classList.contains('grpName')) { state.sections[si].groups[gi].name = t.value; scheduleRender(); return; }
  const row = t.closest('.itemRow'); if (!row) return;
  const ii = [...grp.querySelectorAll(':scope > .grpBody > .itemRow')].indexOf(row);
  if (ii < 0) return;
  /* 技能子条目：技能名 / 说明各自独立编辑 */
  if (t.classList.contains('kt') || t.classList.contains('kd')) {
    const item = state.sections[si].groups[gi].items[ii];
    const kids = Array.isArray(item.kids) ? item.kids : [];
    const krow = t.closest('.kidRow');
    const ki = [...row.querySelectorAll('.kidBox > .kidRow')].indexOf(krow);
    if (ki < 0) return;
    if (t.classList.contains('kt')) kids[ki].t = t.value;
    else kids[ki].d = t.value;
    scheduleRender();
    return;
  }
  if (t.classList.contains('it')) state.sections[si].groups[gi].items[ii].t = t.value;
  if (t.classList.contains('id')) state.sections[si].groups[gi].items[ii].d = t.value;
  if (t.classList.contains('itbl')) {
    const cell = state.sections[si].groups[gi].items[ii];
    const rows = t.value.split('\n')
      .map(l => l.split(/\s*[|｜]\s*/).map(v => v.trim()))
      .filter(a => a.length >= 3 && a[0]);
    cell.table = Object.assign({}, cell.table, { rows: rows.map(a => a.slice(0, 3)) });
  }
  scheduleRender();
});

/* 按钮：增删 */
elSections.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act;
  const sec = btn.closest('.secBox');
  const si = sec ? [...elSections.children].indexOf(sec) : -1;
  const grp = btn.closest('.grpBox');
  const gi = grp ? [...sec.querySelectorAll(':scope > .secBody > .grpBox')].indexOf(grp) : -1;
  const row = btn.closest('.itemRow');
  const ii = row ? [...grp.querySelectorAll(':scope > .grpBody > .itemRow')].indexOf(row) : -1;
  const krow = btn.closest('.kidRow');
  const ki = row && krow ? [...row.querySelectorAll('.kidBox > .kidRow')].indexOf(krow) : -1;

  if (act === 'foldSec' && si >= 0) {
    const s = state.sections[si];
    if (folded.has(s)) folded.delete(s); else folded.add(s);
  } else if (act === 'foldGrp' && si >= 0 && gi >= 0) {
    const g = state.sections[si].groups[gi];
    if (folded.has(g)) folded.delete(g); else folded.add(g);
  } else if (act === 'delSec' && si > 0) state.sections.splice(si, 1);
  else if (act === 'addGrp' && si >= 0) {
    /* 新分组要能看见，把章节展开 */
    folded.delete(state.sections[si]);
    state.sections[si].groups.push({ name: '', items: [{ t: '', d: '' }] });
  } else if (act === 'delGrp' && si >= 0 && gi >= 0) state.sections[si].groups.splice(gi, 1);
  else if (act === 'addItem' && si >= 0 && gi >= 0) {
    /* 新条目要能看见，把分组展开 */
    folded.delete(state.sections[si].groups[gi]);
    state.sections[si].groups[gi].items.push({ t: '', d: '' });
  } else if (act === 'delItem' && si >= 0 && gi >= 0 && ii >= 0) state.sections[si].groups[gi].items.splice(ii, 1);
  else if (act === 'upSec' || act === 'downSec') {
    if (si < 0) return;
    const to = si + (act === 'upSec' ? -1 : 1);
    if (to < 0 || to >= state.sections.length) return;
    /* 第一章固定第一位：它自己不动，别的章节也不能越到它前面（否则局内/局外会整体错位） */
    if (si === 0 || to === 0) return;
    [state.sections[si], state.sections[to]] = [state.sections[to], state.sections[si]];
  } else if (act === 'upGrp' || act === 'downGrp') {
    if (si < 0 || gi < 0) return;
    const arr = state.sections[si].groups;
    const to = gi + (act === 'upGrp' ? -1 : 1);
    if (to < 0 || to >= arr.length) return;
    [arr[gi], arr[to]] = [arr[to], arr[gi]];
  } else if (act === 'upItem' || act === 'downItem') {
    if (si < 0 || gi < 0 || ii < 0) return;
    const arr = state.sections[si].groups[gi].items;
    const to = ii + (act === 'upItem' ? -1 : 1);
    if (to < 0 || to >= arr.length) return;
    [arr[ii], arr[to]] = [arr[to], arr[ii]];
  } else if (act === 'addKid' || act === 'delKid' || act === 'upKid' || act === 'downKid') {
    if (si < 0 || gi < 0 || ii < 0) return;
    const item = state.sections[si].groups[gi].items[ii];
    if (!Array.isArray(item.kids)) item.kids = [];
    if (act === 'addKid') item.kids.push({ t: '', d: '' });
    else if (ki < 0) return;
    else if (act === 'delKid') item.kids.splice(ki, 1);
    else {
      const to = ki + (act === 'upKid' ? -1 : 1);
      if (to < 0 || to >= item.kids.length) return;
      [item.kids[ki], item.kids[to]] = [item.kids[to], item.kids[ki]];
    }
  } else return;

  buildEditor(); render();

  if (act === 'addGrp') {
    const gs = elSections.children[si].querySelectorAll('.secBody > .grpBox');
    const gb = gs[gs.length - 1];
    gb.scrollIntoView({ behavior: 'smooth', block: 'center' });
    gb.querySelector('.grpName').focus();
  } else if (act === 'addItem') {
    const gb = elSections.children[si].querySelectorAll('.secBody > .grpBox')[gi];
    const rows = gb.querySelectorAll('.grpBody > .itemRow');
    const r = rows[rows.length - 1];
    r.scrollIntoView({ behavior: 'smooth', block: 'center' });
    r.querySelector('.it').focus();
  }
});

/* 拖动换位：按住卡片空白处（或标题栏）就能拖，不用精确对准小把手；
   输入框、按钮等交互控件上按下不触发拖动 */
let dragCtx = null;
let suppressClick = false;

function domIndex(parent, el, sel) {
  return [...parent.children].filter(n => n.matches(sel)).indexOf(el);
}

function dragTarget(node) {
  if (node.closest('input, textarea, select, button, a, label')) return null;
  const row = node.closest('.itemRow');
  if (row) return { el: row, sel: '.itemRow' };
  const grp = node.closest('.grpBox');
  if (grp && node.closest('.grpHead')) return { el: grp, sel: '.grpBox' };
  const sec = node.closest('.secBox');
  if (sec && node.closest('.secHead')) return { el: sec, sel: '.secBox' };
  return null;
}

function onDragMove(e) {
  const ctx = dragCtx; if (!ctx) return;
  if (!ctx.active) {
    if (Math.abs(e.clientX - ctx.x) < 4 && Math.abs(e.clientY - ctx.y) < 4) return;
    ctx.active = true;
    ctx.el.classList.add('dragSrc');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }
  const under = e.target && e.target.closest ? e.target : document.elementFromPoint(e.clientX, e.clientY);
  const target = under && under.closest(ctx.sel);
  if (target && target !== ctx.el && target.parentElement === ctx.el.parentElement) {
    const r = target.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    /* 第一章固定第一位：别的章节不能插到它前面 */
    if (ctx.sel === '.secBox' && !after && target === elSections.children[0]) return;
    const ref = after ? target.nextSibling : target;
    if (ref !== ctx.el) target.parentElement.insertBefore(ctx.el, ref);
  }
  /* 拖到窗口上下边缘时自动滚动，长列表也能拖到底 */
  const edge = 70;
  if (e.clientY < edge) window.scrollBy(0, -12);
  else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
}

function onDragUp() {
  const ctx = dragCtx;
  dragCtx = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  if (!ctx || !ctx.active) return;
  /* 拖动结束时不要顺带触发卡片上的点击/聚焦 */
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const now = domIndex(ctx.el.parentElement, ctx.el, ctx.sel);
  if (now >= 0 && now !== ctx.from) {
    const moved = ctx.arr.splice(ctx.from, 1)[0];
    ctx.arr.splice(now, 0, moved);
  }
  buildEditor(); render();
}

elSections.addEventListener('click', e => {
  if (!suppressClick) return;
  suppressClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

elSections.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  suppressClick = false;
  const hit = dragTarget(e.target); if (!hit) return;
  const sec = hit.el.closest('.secBox'); if (!sec) return;
  const si = domIndex(elSections, sec, '.secBox'); if (si < 0) return;

  let arr, from;
  if (hit.sel === '.itemRow') {
    const grp = hit.el.closest('.grpBox');
    const gi = domIndex(grp.parentElement, grp, '.grpBox');
    from = domIndex(hit.el.parentElement, hit.el, '.itemRow');
    if (gi < 0 || from < 0) return;
    arr = state.sections[si].groups[gi].items;
  } else if (hit.sel === '.grpBox') {
    from = domIndex(hit.el.parentElement, hit.el, '.grpBox');
    if (from < 0) return;
    arr = state.sections[si].groups;
  } else {
    /* 第一章固定第一位，不提供拖动 */
    if (si === 0) return;
    from = si;
    arr = state.sections;
  }

  dragCtx = { el: hit.el, sel: hit.sel, arr, from, x: e.clientX, y: e.clientY, active: false };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
});

document.getElementById('btnFoldAll').addEventListener('click', () => {
  const allFolded = state.sections.length > 0 && state.sections.every(s => folded.has(s));
  state.sections.forEach(s => { if (allFolded) folded.delete(s); else folded.add(s); });
  buildEditor(); render();
});

document.getElementById('btnAddSec').addEventListener('click', () => {
  /* 第一章固定占第一位：列表还是空的时候先补一个空占位，
     否则新章节会落到第一位、被当成局内，在局外标签下反而看不见 */
  if (!state.sections.length) state.sections.push({ name: '一、核心玩法更新', groups: [] });
  state.sections.push({ name: '', groups: [{ name: '', items: [{ t: '', d: '' }] }] });
  buildEditor(); render();
  const boxes = elSections.querySelectorAll('.secBox');
  const last = boxes[boxes.length - 1];
  last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  last.querySelector('.secName').focus();
});

function setServerUI() {
  elServer.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state.server));
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function fillMonths() {
  elMonth.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    elMonth.appendChild(o);
  }
}

function fillDays() {
  const max = DAYS_IN_MONTH[(+elMonth.value || 1) - 1];
  const cur = +elDay.value || 1;
  elDay.innerHTML = '';
  for (let d = 1; d <= max; d++) {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    elDay.appendChild(o);
  }
  elDay.value = Math.min(cur, max);
}

function setDateUI() {
  const [m, d] = String(state.date || '').split('.').map(Number);
  elMonth.value = m >= 1 && m <= 12 ? m : 1;
  fillDays();
  elDay.value = d >= 1 && d <= elDay.options.length ? d : 1;
}

function syncDate() {
  state.date = `${+elMonth.value}.${+elDay.value}`;
  syncTitles(); render();
}

elMonth.addEventListener('change', () => { fillDays(); syncDate(); });
elDay.addEventListener('change', syncDate);
elServer.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.server = b.dataset.v;
  setServerUI(); syncTitles(); render();
});
elFoot.addEventListener('input', e => { state.foot = e.target.value; scheduleRender(); });
elSplit.addEventListener('change', e => { state.split = e.target.checked; pageIdx = 0; render(); });

const elScale = document.getElementById('fScale');
elScale.value = String(Math.round(fixedScale * 100));
elScale.addEventListener('change', () => {
  const v = parseInt(elScale.value, 10);
  fixedScale = (v >= 20 && v <= 300 ? v : 66) / 100;
  elScale.value = String(Math.round(fixedScale * 100));
  pageIdx = 0;
  render();
});
document.getElementById('pgPrev').addEventListener('click', () => {
  if (pageIdx <= 0) return;
  showPage(pageIdx - 1);
});
document.getElementById('pgNext').addEventListener('click', () => {
  if (pageIdx >= pagesCache.length - 1) return;
  showPage(pageIdx + 1);
});

/* 批量导入：优先识别 JSON（来自公告提炼），否则按固定格式解析文本 */
function parseJSONSections(text) {
  const raw = String(text || '').trim();
  if (!/^[\[{]/.test(raw)) return null;
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { return null; }
  const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.sections) ? obj.sections : null);
  if (!arr) return null;
  const out = [];
  arr.forEach(sec => {
    const groups = [];
    (sec.groups || []).forEach(g => {
      const items = [];
      (g.items || []).forEach(it => {
        const t = String(it.t == null ? '' : it.t).trim();
        const d = String(it.d == null ? '' : it.d).trim();
        /* 已是「棋手 + 技能子条目」结构时原样保留，一个棋手可挂多个技能 */
        const kids = Array.isArray(it.kids) ? it.kids
          .map(k => ({ t: String(k.t == null ? '' : k.t).trim(), d: String(k.d == null ? '' : k.d).trim() }))
          .filter(k => k.t || k.d) : [];
        if (!t && !d && !kids.length) return;
        if (kids.length) items.push({ t, d, kids });
        /* 三级标签只画胶囊，说明另起一条，避免导入时把描述丢掉 */
        else if (it.sub && t) {
          items.push({ t, d: '', sub: true });
          if (d) items.push({ t: '', d });
        } else items.push({ t, d });
      });
      if (items.length) groups.push({ name: String(g.name || '').trim(), items });
    });
    if (groups.length) out.push({ name: String(sec.name || '').trim(), groups });
  });
  return out.length ? out : null;
}

