/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */

/* =======================  导入后质检  ======================= */
/* 只在提示区列问题，不改内容。文本与技能归属由提炼页算出随 JSON 带来；
   结构、立绘在这里就地检查 */
let auditTasks = [];
function auditStructure(secs) {
  const out = [];
  secs.forEach((s, si) => {
    if (si > 0 && !String(s.name || '').trim()) out.push({ si, msg: `第${si + 1}章没有章节名` });
    (s.groups || []).forEach((g, gi) => {
      if (!String(g.name || '').trim()) {
        out.push({ si, gi, msg: `第${si + 1}章「${s.name || '未命名'}」第${gi + 1}组没有组名` });
      }
      (g.items || []).forEach((it, ii) => {
        if (!String(it.t || '').trim() && String(it.d || '').trim()) {
          out.push({ si, gi, ii, msg: `第${si + 1}章 · ${g.name || '未命名组'} · 第${ii + 1}条：有正文没标题` });
        }
      });
    });
  });
  return out;
}
/* 质检条目都带 si/gi/ii，点一下能跳到编辑器里对应的那条 */
function renderAudit(secs, audit) {
  const wrap = document.getElementById('auditWrap');
  const head = document.getElementById('auditHead');
  const box = document.getElementById('auditBox');
  if (!wrap || !head || !box) return;
  auditTasks = [];
  const text = audit && audit.text;
  let note = '';
  if (text) {
    if (text.bad.length) {
      text.bad.forEach(b => auditTasks.push(typeof b === 'string'
        ? { msg: '原文对不上 · ' + b }
        : Object.assign({}, b, { msg: '原文对不上 · ' + b.msg })));
    } else note = `局外正文 ${text.total} 行与原文一致`;
  } else {
    note = '未核对原文（这份 JSON 不是从提炼页导出的）';
  }
  ((audit && audit.own) || []).forEach(x => auditTasks.push(typeof x === 'string'
    ? { msg: '归属 · ' + x }
    : Object.assign({}, x, { msg: '归属 · ' + x.msg })));
  auditStructure(secs).forEach(x => auditTasks.push(x));
  const miss = missingPortraits();
  if (miss.length) auditTasks.push({ msg: '缺立绘 · ' + miss.join('、') });
  /* 质检块默认收起：只在标题栏留一个按钮，点开才占位 */
  const btn = document.getElementById('btnAudit');
  if (btn) {
    btn.hidden = false;
    btn.classList.toggle('ok', !auditTasks.length);
    btn.textContent = auditTasks.length ? `质检 ${auditTasks.length}` : '质检通过';
  }
  head.classList.toggle('ok', !auditTasks.length);
  head.textContent = auditTasks.length ? '质检项（点条目跳到对应位置）' : '质检通过';
  box.innerHTML = (note ? `<div class="auditNote">${esc(note)}</div>` : '')
    + auditTasks.map((x, i) => `<div class="auditItem" data-k="${i}">${esc(x.msg)}</div>`).join('');
  setAuditOpen(false);
}
/* 质检块开合：默认收起，按标题栏的「质检」按钮才展开 */
let auditOpen = false;
function setAuditOpen(open) {
  auditOpen = !!open;
  const wrap = document.getElementById('auditWrap');
  const btn = document.getElementById('btnAudit');
  if (wrap) wrap.style.display = open ? 'block' : 'none';
  if (btn) btn.classList.toggle('on', open);
}
/* 导入/清空时把质检块一起收起来 */
function clearAudit() {
  const wrap = document.getElementById('auditWrap');
  const head = document.getElementById('auditHead');
  const box = document.getElementById('auditBox');
  const btn = document.getElementById('btnAudit');
  if (wrap) wrap.style.display = 'none';
  if (head) { head.classList.remove('ok'); head.textContent = '质检'; }
  if (box) box.innerHTML = '';
  if (btn) {
    btn.hidden = true;
    btn.classList.remove('on', 'ok');
    btn.textContent = '质检';
  }
  auditTasks = [];
  auditOpen = false;
}
/* 切到对应篇（局内/局外）→ 展开折叠 → 滚到那条并闪一下 */
function auditJump(t) {
  if (!t || t.si == null) return;
  const sec = state.sections[t.si];
  if (!sec) return;
  state.part = t.si === 0 ? 'in' : 'out';
  folded.delete(sec);
  const grp = (sec.groups || [])[t.gi];
  if (grp) folded.delete(grp);
  buildEditor();
  const secBox = elSections.children[t.si];
  const gBox = secBox && secBox.querySelectorAll(':scope > .secBody > .grpBox')[t.gi];
  const row = gBox && (t.ii == null
    ? gBox.querySelector(':scope > .grpHead')
    : gBox.querySelectorAll(':scope > .grpBody > .itemRow')[t.ii]);
  if (!row) return;
  const prev = document.querySelector('.auditHit');
  if (prev) prev.classList.remove('auditHit');
  row.scrollIntoView({ block: 'center' });
  row.classList.add('auditHit');      /* 高亮留到下次点击，方便对照 */
}
document.getElementById('auditBox').addEventListener('click', e => {
  const d = e.target.closest('[data-k]');
  if (d) auditJump(auditTasks[+d.dataset.k]);
});
document.getElementById('btnAudit').addEventListener('click', () => setAuditOpen(!auditOpen));

/* 只导一次：整篇 JSON（第一章 + 局外各章）。重复导入整体替换，不叠加 */
function importInto(tipEl) {
  const box = document.getElementById('importBox1');
  const tip = document.getElementById(tipEl);
  clearAudit();
  const meta = extractMeta(box.value);
  const parsed = parseJSONSections(meta.text);
  const secs = parsed ? normalizeSections(parsed) : [];
  if (!secs.length) {
    tip.className = 'err';
    tip.textContent = '没识别到内容。这里要粘「公告提炼 → 复制整篇 JSON」的原样 JSON。';
    openImportFold();
    return;
  }
  state.sections = secs;
  let audit = null, rawText = '', rawHtml = '';
  try {
    const o = JSON.parse(meta.text);
    if (o && !Array.isArray(o)) {
      audit = o.audit || null;
      rawText = String(o.rawText || '');
      rawHtml = String(o.rawHtml || '');
    }
  } catch (_) { /* 不是对象就视为没有自查结果 */ }
  /* 整篇公告原文：右侧栏渲染（旧 JSON 没这字段时留空，栏里退回纯文本/条目原句） */
  state.rawText = rawText;
  state.rawHtml = rawHtml;

  if (meta.server) { state.server = meta.server; setServerUI(); }
  if (meta.date) { state.date = meta.date; setDateUI(); }
  if (meta.server || meta.date) syncTitles();
  updateStatus();
  setImportState(`已导入 ${secs.length} 章`);
  closeImportFold();
  pageIdx = 0;
  buildEditor(); render();

  const g = secs.reduce((a, s) => a + s.groups.length, 0);
  const n = secs.reduce((a, s) => a + s.groups.reduce((b, x) => b + x.items.length, 0), 0);
  const recognized = [meta.server && `服务器 ${meta.server}`, meta.date && `日期 ${meta.date}`].filter(Boolean).join(' · ');
  tip.className = '';
  tip.textContent = `已导入整篇：${secs.length} 个章节 / ${g} 个分组 / ${n} 个条目`
    + (recognized ? `；已识别 ${recognized}` : '');
  renderAudit(secs, audit);
}

document.getElementById('btnImport1').addEventListener('click', () => importInto('importTip1'));

/* ---------- 棋手立绘：已内置在 出图_立绘.js 的 PORTRAITS 里 ---------- */
/* 当前公告里出现、但字典里没有的棋手名 */
function missingPortraits() {
  const out = new Set();
  (state.sections || []).forEach(sec => (sec.groups || []).forEach(grp => {
    if (!/棋手/.test(grp.name || '')) return;
    (grp.items || []).forEach(it => {
      const n = heroName(it.t);
      if (n && !PORTRAITS[n]) out.add(n);
    });
  }));
  return Array.from(out);
}

/* ---------- 导出：一次选好文件夹 / 一次下载，不再逐张弹「另存为」 ---------- */
function exportBase() {
  const safe = (state.title || '更新公告').replace(/[\\/:*?"<>|\n]/g, '').slice(0, 20);
  return `${safe}_${state.server}`;
}
function exportName(i, total) {
  const pg = pagesCache[i];
  /* 分套时文件名带套名，两套序号各自从 1 开始 */
  if (pg && pg.setName) return `${exportBase()}_${pg.setName}_${pg.setIndex + 1}.png`;
  return `${exportBase()}${total > 1 ? `_${i + 1}` : ''}.png`;
}
/* 每张图所在的子文件夹：大文件夹（公告名_服务器）里再按篇分一层。
   两篇分别导出后都落在同一个大文件夹下，不会散落在所选根目录 */
function exportFolderFor(i) {
  const pg = pagesCache[i];
  return pg && pg.setName ? `${exportBase()}/${pg.setName}` : exportBase();
}
/* ZIP 内路径 / 选目录时的子目录 */
function exportPath(i, total) {
  return `${exportFolderFor(i)}/${exportName(i, total)}`;
}

/* ZIP 仅存储不压缩（PNG 本身已压缩），用于浏览器不支持选文件夹时一次下载全部 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);        /* 文件名 UTF-8 */
    dv.setUint16(8, 0, true);             /* 存储，不压缩 */
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0x21, true);         /* 1980-01-01 */
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, f.data);

    const ch = new Uint8Array(46 + name.length);
    const dv2 = new DataView(ch.buffer);
    dv2.setUint32(0, 0x02014b50, true);
    dv2.setUint16(4, 20, true);
    dv2.setUint16(6, 20, true);
    dv2.setUint16(8, 0x0800, true);
    dv2.setUint16(10, 0, true);
    dv2.setUint16(12, 0, true);
    dv2.setUint16(14, 0x21, true);
    dv2.setUint32(16, crc, true);
    dv2.setUint32(20, f.data.length, true);
    dv2.setUint32(24, f.data.length, true);
    dv2.setUint16(28, name.length, true);
    dv2.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + f.data.length;
  });
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const dv3 = new DataView(end.buffer);
  dv3.setUint32(0, 0x06054b50, true);
  dv3.setUint16(8, files.length, true);
  dv3.setUint16(10, files.length, true);
  dv3.setUint32(12, cdSize, true);
  dv3.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* 导出按钮文案的回退计时器：再次导出时先清掉旧的，避免旧计时器提前改写文案 */
let exportResetTimer = 0;
/* 路径按「/」逐层建目录：大文件夹 / 篇名 */
async function dirHandleFor(root, path) {
  let d = root;
  for (const seg of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(seg, { create: true });
  return d;
}
/* =======================  导出水印  ======================= */
/* 斜向平铺水印，参数沿用「加水印工具/watermark.py」：字体 40px、间距 294×212、
   倾角 28°、不透明度 34/255、深蓝 rgb(31,78,121)，按 1080×1440 为基准等比缩放。
   只画在导出的 PNG 上；导出结束后的 render() 会把预览恢复干净 */
const WM_TEXT = '万象棋小菜鸟';       /* 要换水印文字只改这一行 */
function drawWatermark(ctx, W, H) {
  const k = Math.min(3, Math.max(0.35, Math.sqrt((W * H) / (1080 * 1440))));
  const fontPx = Math.round(Math.min(130, Math.max(14, 40 * k)));
  const stepX = Math.max(108, 294 * k), stepY = Math.max(80, 212 * k);
  const base = 34, ang = 28 * Math.PI / 180;
  /* 固定种子的伪随机：同一张图每次加的疏密/角度抖动都一样 */
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  ctx.save();
  ctx.font = `700 ${fontPx}px "Microsoft YaHei", "微软雅黑", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgb(31,78,121)';
  const tw = ctx.measureText(WM_TEXT).width * Math.cos(ang) + fontPx * Math.sin(ang);
  const th = ctx.measureText(WM_TEXT).width * Math.sin(ang) + fontPx * Math.cos(ang);
  for (let row = 0, y = 0; y < H + th; y += th + stepY, row++) {
    const off = row % 2 ? (tw + stepX) / 2 : 0;   /* 砖墙错格 */
    for (let x = -tw / 2 + off; x < W + tw; x += tw + stepX) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, base + Math.round((rnd() - 0.5) * 12)) / 255);
      ctx.translate(x + (rnd() - 0.5) * 0.3 * stepX, y + (rnd() - 0.5) * 0.3 * stepY);
      ctx.rotate(ang + (rnd() - 0.5) * 2 * (7 * Math.PI / 180));
      ctx.fillText(WM_TEXT, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* 导出：先点「导出」弹出选篇（局内 / 局外 / 合并全部），再走同一条导出流程 */
document.getElementById('btnExport').addEventListener('click', e => {
  e.stopPropagation();
  const open = elExportMenu.hidden;
  closeMenus();
  elExportMenu.hidden = !open;
});
elExportMenu.addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  closeMenus();
  doExport(b.dataset.k);
});

async function doExport(choice) {
  const btn = document.getElementById('btnExport');
  const label = btn.textContent;
  /* 选哪一篇只影响这一次导出：导出完把预览还原成用户原来的那一篇 */
  const prevPart = state.part, prevSplit = state.split;
  if (choice === 'all') state.split = false;
  else { state.split = true; state.part = choice; }
  const restore = () => {
    state.part = prevPart;
    state.split = prevSplit;
    pageIdx = 0;
    applyPartFilter();
    render();
  };
  render();   /* 顺便清掉输入防抖，保证导出的是最新内容 */
  const ctx = cv.getContext('2d');
  const total = pagesCache.length;
  if (!total) { restore(); return; }
  /* 分套时这一篇只有封面 = 还没有正文，出一张孤零零的封面没有意义 */
  if (state.split && total === 1) {
    clearTimeout(exportResetTimer);
    btn.textContent = '这一篇还没有内容';
    exportResetTimer = setTimeout(() => { btn.textContent = label; }, 1800);
    restore();
    return;
  }
  clearTimeout(exportResetTimer);
  btn.disabled = true;

  /* 支持文件夹选择就先选一次目录：之后所有 PNG 直接写入，不再弹任何保存框 */
  let dir = null;
  if (window.showDirectoryPicker) {
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wxq-png' });
    } catch (e) {
      if (e && e.name === 'AbortError') { btn.disabled = false; return; }
      dir = null;   /* 浏览器限制则退回打包下载 */
    }
  }

  const files = [];
  const dirMap = new Map();
  try {
    for (let i = 0; i < total; i++) {
      btn.textContent = `生成中 ${i + 1}/${total}`;
      paintPage(ctx, i);
      /* 封面（局内 / 局外各一张）不加水印，内容页才加 */
      if (!(pagesCache[i] && pagesCache[i].cover)) drawWatermark(ctx, cv.width, cv.height);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      if (dir) {
        btn.textContent = `写入中 ${i + 1}/${total}`;
        const folder = exportFolderFor(i);
        if (!dirMap.has(folder)) dirMap.set(folder, await dirHandleFor(dir, folder));
        const target = dirMap.get(folder);
        const fh = await target.getFileHandle(exportName(i, total), { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        files.push({ name: exportPath(i, total), blob });
      }
    }
    if (!dir) {
      btn.textContent = '打包中…';
      const packed = [];
      for (const f of files) packed.push({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) });
      const a = document.createElement('a');
      /* 一次只打当前这一篇，压缩包名带上篇名，两个包解开后落进同一个大文件夹 */
      const setName = pagesCache[0] && pagesCache[0].setName;
      a.download = `${exportBase()}${setName ? '_' + setName : ''}.zip`;
      a.href = URL.createObjectURL(makeZip(packed));
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    btn.textContent = `已导出 ${total} 张`;
    exportResetTimer = setTimeout(() => { btn.textContent = label; }, 1800);
  } catch (e) {
    console.error(e);
    btn.textContent = '导出失败';
    exportResetTimer = setTimeout(() => { btn.textContent = label; }, 1800);
  }
  btn.disabled = false;
  restore();
}

/* =======================  初始化  ======================= */
fillMonths();
setDateUI();
setServerUI();
elFoot.value = state.foot;
setImportState('已载入示例');
buildEditor();
render();

/* =======================  自动填充  ======================= */
/* 解析规则只放在「公告提炼」里：出图页藏一个看不见的提炼页让它干活，
   拿到整篇数据后走同一个导入入口，避免两套规则各写一遍。
   getData(提炼页window) 自己决定抓哪一篇：带 ?newsid= 就抓那篇，不带就取最新 */
/* 整篇 JSON 塞进导入框，再走统一的导入入口（两处自动填充共用） */
function applyWholeData(data, title) {
  const tip = document.getElementById('importTip1');
  document.getElementById('importBox1').value = JSON.stringify(data, null, 2);
  importInto('importTip1');
  if (title) tip.textContent = '《' + title + '》　' + tip.textContent;
}

async function autoFill(getData, statusText) {
  const tip = document.getElementById('importTip1');
  tip.className = '';
  tip.textContent = statusText;
  setImportState('正在抓取…');
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = '公告提炼.html';
  document.body.appendChild(frame);
  try {
    await new Promise((ok, bad) => {
      const timer = setTimeout(() => bad(new Error('提炼页加载超时')), 20000);
      frame.onload = () => { clearTimeout(timer); ok(); };
      frame.onerror = () => { clearTimeout(timer); bad(new Error('提炼页加载失败')); };
    });
    const got = await getData(frame.contentWindow);
    if (!got.data || !got.data.sections.length) throw new Error('这篇公告没有解析到内容');
    applyWholeData(got.data, got.title);
  } catch (e) {
    tip.className = 'err';
    tip.textContent = '自动填充失败：' + (e.message || e) + '（仍可手动粘贴导入）';
    openImportFold();
  } finally {
    frame.remove();
  }
}

/* 本地双击（file://）打开时读不到提炼页的 window（跨源），
   改成消息一问一答：把公告编号发给藏着的提炼页，它抓取解析后回传整篇数据 */
function noticeFromFrame(id) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = '公告提炼.html';
    document.body.appendChild(frame);
    const req = 'wxq-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      frame.remove();
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('提炼页没有回应（25 秒），检查网络后重试')), 25000);
    function onMsg(e) {
      const d = e.data;
      if (!d || d.type !== 'wxq-auto-result' || d.req !== req) return;
      if (d.ok) finish(null, d);
      else finish(new Error(d.error || '抓取失败'));
    }
    window.addEventListener('message', onMsg);
    frame.addEventListener('load', () => {
      frame.contentWindow.postMessage({ type: 'wxq-auto', req, id }, '*');
    });
  });
}

/* 本地粘贴链接 / 编号后抓取填充 */
async function localFillFromUrl() {
  const input = document.getElementById('localUrl');
  const tip = document.getElementById('importTip1');
  const btn = document.getElementById('btnLocalFetch');
  const raw = String(input.value || '').trim();
  const id = (raw.match(/newsid=(\d+)/i) || [])[1] || (/^\d+$/.test(raw) ? raw : '');
  if (!id) {
    tip.className = 'err';
    tip.textContent = '链接里没有找到 newsid，粘贴公告链接或直接填编号。';
    setImportState('没找到公告编号');
    return;
  }
  tip.className = '';
  tip.textContent = '正在抓取并解析这篇公告…';
  setImportState('正在抓取…');
  btn.disabled = true;
  try {
    const got = await noticeFromFrame(id);
    if (!got.data || !got.data.sections.length) throw new Error('这篇公告没有解析到内容');
    applyWholeData(got.data, '');
    tip.className = '';
    tip.textContent = `已按公告 ${id} 填好：${got.data.sections.length} 个章节`;
  } catch (e) {
    tip.className = 'err';
    tip.textContent = '抓取失败：' + (e.message || e) + '（仍可手动粘贴导入）';
    setImportState('抓取失败');
  } finally {
    btn.disabled = false;
  }
}

(function autoStart() {
  /* 两种打开方式都走「粘贴链接自动填充」：线上（http/https）和本地双击一样，
     把公告链接或编号粘到那行，点「抓取并填充」就行 */
  const row = document.getElementById('localUrlRow');
  if (row) row.hidden = false;
  const btn = document.getElementById('btnLocalFetch');
  const input = document.getElementById('localUrl');
  if (btn) btn.addEventListener('click', localFillFromUrl);
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') localFillFromUrl(); });

  if (location.protocol === 'file:') {
    const tip = document.getElementById('importTip1');
    tip.className = '';
    tip.textContent = '双击打开时不能自动读公告：把公告链接粘到上面那行，点「抓取并填充」。';
    setImportState('粘贴链接自动填充');
    return;
  }
  /* 线上带 ?newsid= 打开时直接填这一篇；没带就自动抓最新一篇。
     上面那行贴链接入口一直留着，想换一篇就粘进去覆盖 */
  const id = new URLSearchParams(location.search).get('newsid');
  if (id) {
    autoFill(async w => ({ data: await w.__wxq.autoNotice(id), title: '' }), '正在抓取公告并解析整篇…');
  } else {
    autoFill(async w => {
      const r = await w.__wxq.autoLatest();
      return { data: r.data, title: r.title };
    }, '正在找最新一篇更新公告…');
  }
})();
