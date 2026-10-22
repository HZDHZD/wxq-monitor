/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* ====================  事件  ==================== */
async function fetchAndParse(id) {
  setStatus('正在抓取公告…');
  $('#btnFetch').disabled = true;
  try {
    const msg = await loadNews(id);
    const sections = parseNotice(msg.sContent || '');
    const dm = String(msg.sTitle || msg.sDesc || '').match(/(\d{1,2})月(\d{1,2})日/);
    const meta = {
      date: dm ? (+dm[1]) + '.' + (+dm[2]) : '',
      server: /体验服/.test(msg.sTitle || '') ? '体验服' : '正式服',
      title: msg.sTitle || ''
    };
    prepareAndRender(sections, meta);
    lastNotice = { html: msg.sContent || '', meta };
    setStatus('抓取成功：' + meta.title + '（' + totalCount + ' 条）', 'ok');
    return true;
  } catch (e) {
    setStatus(e.message || '抓取失败', 'err');
    return false;
  } finally {
    $('#btnFetch').disabled = false;
  }
}

$('#btnFetch').onclick = () => {
  const id = newsIdFrom($('#url').value);
  if (!id) { setStatus('链接里没有找到 newsid，请检查输入', 'err'); return; }
  fetchAndParse(id);
};

$('#btnParsePaste').onclick = () => {
  const raw = $('#pasteBox').value.trim();
  if (!raw) { setStatus('先粘贴公告内容', 'err'); return; }
  const html = raw.includes('<') ? raw : textToHtml(raw);
  const sections = parseNotice(html);
  const dm = raw.match(/(\d{1,2})月(\d{1,2})日/);
  const meta = {
    date: dm ? (+dm[1]) + '.' + (+dm[2]) : '',
    server: /体验服/.test(raw) ? '体验服' : '正式服',
    title: ''
  };
  prepareAndRender(sections, meta);
  lastNotice = { html, meta };
  setStatus('已解析粘贴内容（' + totalCount + ' 条）', 'ok');
};

$('#mergeCore').onchange = () => {
  render(finalSections(rawSections, !noCoreMode && $('#mergeCore').checked), curMeta);
};

/* 本篇没有第一章：不套核心章节，整篇按第二～五章交给 AI */
$('#noCore').onchange = () => {
  noCoreMode = $('#noCore').checked;
  if (!rawSections.length) return;
  prepareAndRender(rawSections, curMeta);
  setStatus(noCoreMode
    ? '本篇没有第一章：所有章节按局外处理，用「复制后续章节提示词」把整篇交给 AI'
    : '已恢复：第一章走 JSON，其余章节交给 AI', 'ok');
};

/* 第一章长句写法切换：精简（数值就地标箭头）↔ 全原文（整句两端全写） */
$('#inlineMode').onchange = () => {
  inlineMode = $('#inlineMode').checked;
  if (!lastNotice.html) return;
  prepareAndRender(parseNotice(lastNotice.html), lastNotice.meta);
  setStatus((inlineMode ? '第一章长句：精简写法（数值就地标箭头）' : '第一章长句：全原文写法（整句两端全写）')
    + '（' + totalCount + ' 条）', 'ok');
};

$('#btnAll').onclick = () => { document.querySelectorAll('.item .ck').forEach(c => c.checked = true); refreshCount(); syncHead(); };
$('#btnNone').onclick = () => { document.querySelectorAll('.item .ck').forEach(c => c.checked = false); refreshCount(); syncHead(); };

/* 只保留本章勾选，方便一章一份提示词分别生成，避免整篇输出被截断 */
document.addEventListener('click', e => {
  const b = e.target.closest('.onlySec');
  if (!b) return;
  const secEl = b.closest('.sec');
  document.querySelectorAll('.item .ck').forEach(c => { c.checked = false; });
  secEl.querySelectorAll('.item .ck').forEach(c => { c.checked = true; });
  refreshCount(); syncHead();
  setStatus('只勾选了「' + secEl.dataset.name + '」，复制提示词后单独发给 DeepSeek', 'ok');
});
$('#btnDownload').onclick = downloadJSON;
$('#btnCopy').onclick = copyJSON;
$('#btnPrompt').onclick = copyPrompt;

document.addEventListener('input', e => {
  if (e.target.classList.contains('d')) autoGrow(e.target);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.classList.contains('ck')) { refreshCount(); syncHead(); return; }
  if (el.classList.contains('ckSec')) {
    el.closest('.sec').querySelectorAll('.item .ck').forEach(c => c.checked = el.checked);
    refreshCount(); syncHead();
  } else if (el.classList.contains('ckGrp')) {
    el.closest('.grp').querySelectorAll('.item .ck').forEach(c => c.checked = el.checked);
    refreshCount(); syncHead();
  }
});

/* 自动化入口：抓取 + 解析，直接返回第一章数据（失败抛错，页面提示照常走） */
async function autoFirstChapter(id) {
  if (!await fetchAndParse(id)) throw new Error('抓取失败，请检查公告编号或网络');
  return firstChapterData();
}

/* 自动化入口：不给编号时，自动取最新一篇更新公告 */
async function autoLatest() {
  const it = pickLatest(await loadNewsList(12));
  if (!it) throw new Error('没有取到公告列表');
  return { id: it.id, title: it.title, data: await autoFirstChapter(it.id) };
}

/* 供自动化测试 / 后续合并调用 */
window.__wxq = { loadNews, loadNewsList, pickLatest, parseNotice, textToHtml, fetchAndParse, collect, buildDeepSeekText, autoFirstChapter, autoLatest };
