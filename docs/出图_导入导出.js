/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */

/* 两块共用：解析、套用元信息、刷新编辑器。
   which=1 只换第一章，which=2 只换后续章节，重复导入不会叠加 */
function importInto(which, tipEl) {
  const box = document.getElementById(which === 1 ? 'importBox1' : 'importBox2');
  const tip = document.getElementById(tipEl);
  const meta = extractMeta(box.value);
  const secs = parseDigest(meta.text);
  /* 第二块是第二～五章：正文里出现的日期（「10月11日22:00正式解锁」）不是公告日期，
     只有显式 @@META 或 JSON 才采纳，否则沿用第一章带过来的元信息 */
  const isJson = /^\s*[\[{]/.test(box.value.trim());
  const hasMeta = isJson || /(?:^|\n)\s*(?:【元信息】)?\s*[@＠]{2}\s*META/i.test(box.value);
  if (which === 2 && !hasMeta) { meta.server = ''; meta.date = ''; }
  if (!secs.length) {
    tip.className = 'err';
    tip.textContent = which === 1
      ? '没识别到内容。这里要粘「公告提炼 → 复制第一章 JSON」的原样 JSON。'
      : '没识别到内容。可以直接粘官方原文，也可以粘带符号的文本：章节「二、…」/ 分组「【…】」/ 三级「◆ …」/ 条目「● …」/ 无标题条目「○ …」。';
    return;
  }
  /* 当前还是示例数据时直接清空，不把示例混进来 */
  const isSample = JSON.stringify(state.sections) === JSON.stringify(SAMPLE.sections);
  const current = isSample ? [] : state.sections;
  let dropped = 0;
  let imported = secs;

  if (which === 1) {
    /* 第一章整体替换：粘进来的内容原样排在最前，后面的章节保留。
       粘进来不止一章说明是整篇 JSON，旧的后续章节一并换掉，避免局外重复 */
    const keep = secs.length > 1 ? [] : current.slice(1);
    state.sections = secs.concat(keep);
  } else {
    /* 后续章节整体替换：第一位永远是第一章，内容保留；其余换成本次粘进来的。
       粘进来的第一条如果是第一章（「一、…」或无序号、且点名核心玩法），说明是整篇公告
       连第一章一起粘了，丢掉这一段，避免出现两个第一章；名字带「二、」这类序号的
       局外章节照常保留（章节名里出现「核心玩法」不算第一章） */
    const headIsChapterOne = isCoreSec(secs[0])
      && !/^\s*(?:二|三|四|五|六|七|八|九|十|\d+)\s*[、.．:：]/.test(String(secs[0].name || ''));
    dropped = headIsChapterOne ? 1 : 0;
    imported = secs.slice(dropped);
    const core = current.length ? current.slice(0, 1) : [{ name: '一、核心玩法更新', groups: [] }];
    state.sections = core.concat(imported);
  }

  if (meta.server) { state.server = meta.server; setServerUI(); }
  if (meta.date) { state.date = meta.date; setDateUI(); }
  if (meta.server || meta.date) syncTitles();
  pageIdx = 0;
  buildEditor(); render();

  const g = imported.reduce((a, s) => a + s.groups.length, 0);
  const n = imported.reduce((a, s) => a + s.groups.reduce((b, x) => b + x.items.length, 0), 0);
  const recognized = [meta.server && `服务器 ${meta.server}`, meta.date && `日期 ${meta.date}`].filter(Boolean).join(' · ');
  tip.className = '';
  tip.textContent = (which === 1
    ? `已导入第一章：${imported.length} 个章节 / ${g} 个分组 / ${n} 个条目`
    : `已导入后续 ${imported.length} 章 / ${g} 个分组 / ${n} 个条目（第一章保留）`)
    + (dropped ? `；已忽略随文本带进来的第一章` : '')
    + (recognized ? `；已识别 ${recognized}` : '');
}

document.getElementById('btnImport1').addEventListener('click', () => importInto(1, 'importTip1'));
document.getElementById('btnImport2').addEventListener('click', () => importInto(2, 'importTip2'));

document.getElementById('btnSample').addEventListener('click', () => {
  state.date = SAMPLE.date; state.server = SAMPLE.server; state.foot = SAMPLE.foot;
  state.sections = JSON.parse(JSON.stringify(SAMPLE.sections));
  syncTitles();
  setDateUI(); setServerUI(); elFoot.value = state.foot;
  buildEditor(); render();
});

/* ---------- 棋手立绘：从素材文件夹按文件名载入 ---------- */
/* 支持：08_皮肤 每个棋手子文件夹里的「棋手名-封面.jpg」（原皮封面，优先），
   03_棋手KV 的「棋手名-KV竖版.jpg / 棋手名-KV横版.jpg」（有背景），
   04_透明立绘 的「棋手名-立绘PC.png / 棋手名-立绘M.png」，以及旧的「棋手名-棋手立绘.jpg」 */
const PORTRAIT_FILE_RE = /^(.+?)-(封面|KV横版|KV竖版|立绘PC|立绘M|棋手立绘)\.(png|jpe?g|webp)$/i;
/* 同名多张时的优先级：原皮封面最优先，其次 KV横版 */
const PORTRAIT_RANK = { '封面': 0, 'kv横版': 1, 'kv竖版': 2, '立绘pc': 3, '立绘m': 4, '棋手立绘': 5 };
const portraitRank = kind => {
  const v = PORTRAIT_RANK[String(kind || '').toLowerCase()];
  return v === undefined ? 9 : v;
};
let portraitURLs = [];

function loadPortraitFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => resolve({ im, url });
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load fail')); };
    im.src = url;
  });
}

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

document.getElementById('btnPortraits').addEventListener('click', () => {
  document.getElementById('portraitDir').click();
});

document.getElementById('portraitDir').addEventListener('change', async (e) => {
  const tip = document.getElementById('portraitTip');
  const picked = {};
  Array.from(e.target.files || []).forEach(f => {
    const m = String(f.name || '').match(PORTRAIT_FILE_RE);
    if (!m) return;
    const name = m[1].trim(), kind = m[2];
    /* 「08_皮肤」里同一棋手有多套皮肤封面，只认原皮：文件名必须和所在子文件夹同名 */
    if (/^封面$/i.test(kind)) {
      const parts = String(f.webkitRelativePath || '').split('/');
      const dir = (parts[parts.length - 2] || '').trim();
      if (!dir || dir !== name) return;
    }
    if (!picked[name] || portraitRank(kind) < portraitRank(picked[name].kind)) {
      picked[name] = { file: f, kind };
    }
  });
  const names = Object.keys(picked);
  if (!names.length) {
    tip.className = 'err';
    tip.textContent = '没找到立绘文件。请选「08_皮肤（每套皮肤封面与KV）」（取原皮封面）、「03_棋手KV（带背景宣传图）」或「04_透明立绘（去背景透明PNG）」文件夹。';
    e.target.value = '';
    return;
  }

  portraitURLs.forEach(u => URL.revokeObjectURL(u));
  portraitURLs = [];

  let loaded = 0;
  for (const name of names) {
    try {
      const { im, url } = await loadPortraitFile(picked[name].file);
      PORTRAITS[name] = url;
      PORTRAIT_IMGS[name] = im;
      portraitURLs.push(url);
      loaded++;
    } catch (_) { /* 单张坏图跳过 */ }
  }

  render();
  const miss = missingPortraits();
  tip.className = loaded ? '' : 'err';
  tip.textContent = loaded
    ? `已载入 ${loaded} 位棋手立绘` + (miss.length
        ? `；本公告还有未匹配：${miss.slice(0, 8).join('、')}${miss.length > 8 ? ' 等' : ''}`
        : '；本公告里的棋手都已匹配')
    : '立绘文件读取失败，换个文件夹再试。';
  e.target.value = '';
});

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
document.getElementById('btnExport').addEventListener('click', async () => {
  const btn = document.getElementById('btnExport');
  const label = btn.textContent;
  /* 输入防抖还没跑就先补一次重排，保证导出的是最新内容 */
  if (renderTimer) render();
  const ctx = cv.getContext('2d');
  const total = pagesCache.length;
  if (!total) return;
  /* 分套时这一篇只有封面 = 还没有正文，出一张孤零零的封面没有意义 */
  if (state.split && total === 1) {
    clearTimeout(exportResetTimer);
    btn.textContent = '这一篇还没有内容';
    exportResetTimer = setTimeout(() => { btn.textContent = label; }, 1800);
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
  render();
});

/* =======================  初始化  ======================= */
fillMonths();
setDateUI();
setServerUI();
elFoot.value = state.foot;
buildEditor();
render();

/* =======================  自动填充  ======================= */
/* 解析规则只放在「公告提炼」里：出图页藏一个看不见的提炼页让它干活，
   拿到第一章数据后走同一个导入入口，避免两套规则各写一遍。
   getData(提炼页window) 自己决定抓哪一篇：带 ?newsid= 就抓那篇，不带就取最新 */
async function autoFill(getData, statusText) {
  const tip = document.getElementById('importTip1');
  tip.className = '';
  tip.textContent = statusText;
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
    if (!got.data || !got.data.sections.length) throw new Error('这篇公告里没有第一章内容');
    document.getElementById('importBox1').value = JSON.stringify(got.data, null, 2);
    importInto(1, 'importTip1');
    if (got.title) tip.textContent = '《' + got.title + '》　' + tip.textContent;
  } catch (e) {
    tip.className = 'err';
    tip.textContent = '自动填充失败：' + (e.message || e) + '（仍可手动粘贴导入）';
  } finally {
    frame.remove();
  }
}

(function autoStart() {
  if (location.protocol === 'file:') {
    const tip = document.getElementById('importTip1');
    tip.className = 'err';
    tip.textContent = '自动填充要用网址打开（双击本地文件不行），手动粘贴照常可用。';
    return;
  }
  const id = new URLSearchParams(location.search).get('newsid');
  if (id) {
    autoFill(async w => ({ data: await w.__wxq.autoFirstChapter(id), title: '' }), '正在抓取公告并解析第一章…');
  } else {
    autoFill(async w => {
      const r = await w.__wxq.autoLatest();
      return { data: r.data, title: r.title };
    }, '正在找最新一篇更新公告…');
  }
})();
