/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* ====================  回归对照（改完解析自查）  ==================== */
/* 做法：把几篇公告的原文和「当时拆出来的结果」存在这个浏览器里，作为基准。
   以后改完解析代码，打开「公告提炼.html?regress=1」，它会把这几篇重新拆一遍，
   逐条对比并列出「哪篇、第几章第几组第几条、旧的是什么、新的是什么」。
   不带 regress 参数时完全不运行，正常使用不受影响 */

const REG_KEY = 'wxq-regress-v1';

/* 只取标题和正文做对比：条目数量、章节/组名、每条的文字 */
function regSnapshot(data) {
  return (data.sections || []).map(s => ({
    name: s.name || '',
    groups: (s.groups || []).map(g => ({
      name: g.name || '',
      items: (g.items || []).map(it => ({ t: it.t || '', d: it.d || '' }))
    }))
  }));
}

/* 逐层对比，返回人能看懂的差异行 */
function regDiffLines(base, now) {
  const out = [];
  if (base.length !== now.length) {
    out.push(`章节数量：基准 ${base.length} → 现在 ${now.length}`);
  }
  const sn = Math.max(base.length, now.length);
  for (let si = 0; si < sn; si++) {
    const b = base[si], a = now[si];
    const tag = `第${si + 1}章`;
    if (!b || !a) continue;
    if (b.name !== a.name) out.push(`${tag} 章节名：${b.name} → ${a.name}`);
    if (b.groups.length !== a.groups.length) {
      out.push(`${tag}「${b.name}」分组数量：基准 ${b.groups.length} → 现在 ${a.groups.length}`);
    }
    const gn = Math.max(b.groups.length, a.groups.length);
    for (let gi = 0; gi < gn; gi++) {
      const bg = b.groups[gi], ag = a.groups[gi];
      if (!bg || !ag) continue;
      const gtag = `${tag}「${bg.name}」`;
      if (bg.name !== ag.name) out.push(`${gtag} 组名：${bg.name} → ${ag.name}`);
      if (bg.items.length !== ag.items.length) {
        out.push(`${gtag} 条目数量：基准 ${bg.items.length} → 现在 ${ag.items.length}`);
      }
      const inn = Math.max(bg.items.length, ag.items.length);
      for (let ii = 0; ii < inn; ii++) {
        const bi = bg.items[ii], ai = ag.items[ii];
        if (!bi || !ai) continue;
        if (bi.t !== ai.t) out.push(`${gtag} 第${ii + 1}条 标题：${bi.t} → ${ai.t}`);
        if (bi.d !== ai.d) {
          out.push(`${gtag} 第${ii + 1}条 正文变了\n    旧：${bi.d.slice(0, 80)}\n    新：${ai.d.slice(0, 80)}`);
        }
      }
    }
  }
  return out;
}

/* 回归结果放在一个浮层里，不影响页面本身 */
function regShow(title, lines, bad) {
  let box = document.getElementById('regBox');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'regBox';
    box.style.cssText = 'position:fixed;left:16px;top:16px;right:16px;bottom:16px;z-index:9999;'
      + 'margin:0;padding:16px;overflow:auto;white-space:pre-wrap;word-break:break-word;'
      + 'background:#fff;color:#222;border:1px solid #ccc;border-radius:8px;'
      + 'font:12px/1.7 Consolas,Menlo,monospace;box-shadow:0 8px 30px rgba(0,0,0,.18)';
    document.body.appendChild(box);
  }
  box.textContent = title + '\n\n' + (lines.length ? lines.join('\n\n') : '（没有差异）');
  box.style.borderColor = bad ? '#e0a0a0' : '#a8cca8';
}

function regBase() {
  try { return JSON.parse(localStorage.getItem(REG_KEY) || '{}'); } catch (_) { return {}; }
}

/* 存基准：默认取最近 3 篇更新公告，也可以用 ids=编号1,编号2 指定 */
async function regMake(ids, n) {
  let list = ids && ids.length ? ids.map(id => ({ id, title: '' })) : [];
  if (!list.length) {
    const all = await loadNewsList(12);
    list = all.filter(it => /更新/.test(it.title)).slice(0, n || 3);
  }
  const base = regBase();
  const done = [];
  for (const it of list) {
    setStatus('正在存基准：' + it.id + '…');
    const msg = await loadNews(it.id);
    const html = msg.sContent || '';
    const meta = { date: '', server: /体验服/.test(msg.sTitle || '') ? '体验服' : '正式服', title: msg.sTitle || '' };
    prepareAndRender(parseNotice(html), meta);
    base[it.id] = { title: msg.sTitle || it.title || '', meta, html, snap: regSnapshot(collect()) };
    done.push(it.id + '（' + totalCount + ' 条）');
  }
  localStorage.setItem(REG_KEY, JSON.stringify(base));
  setStatus('已存 ' + done.length + ' 篇基准：' + done.join('、'), 'ok');
  regShow('已存 ' + done.length + ' 篇基准（以后带 ?regress=1 打开就会自动对比）', done, false);
}

/* 跑对比：把存下来的原文重新拆一遍，和基准逐条比 */
async function regRun() {
  const base = regBase();
  const ids = Object.keys(base);
  if (!ids.length) {
    regShow('还没有基准', ['先打开「公告提炼.html?regress=1&make=1」存一次基准。'], true);
    return [];
  }
  const lines = [];
  let bad = false;
  for (const id of ids) {
    const c = base[id];
    try {
      prepareAndRender(parseNotice(c.html), c.meta || {});
      const diffs = regDiffLines(c.snap, regSnapshot(collect()));
      if (diffs.length) { bad = true; lines.push(`✗ ${id} ${c.title || ''}：${diffs.length} 处不同\n` + diffs.slice(0, 15).join('\n')); }
      else lines.push(`✓ ${id} ${c.title || ''}：一致`);
    } catch (e) {
      bad = true;
      lines.push(`✗ ${id} 跑出错：${(e && e.message) || e}`);
    }
  }
  setStatus(bad ? '回归对照：有差异' : '回归对照：全部一致', bad ? 'err' : 'ok');
  regShow(bad ? '回归对照：有差异（改动可能压坏了这几条）' : '回归对照：全部一致', lines, bad);
  return lines;
}

(function regressAuto() {
  const q = new URLSearchParams(location.search);
  if (q.get('regress') !== '1') return;
  if (q.get('make') === '1') {
    const ids = String(q.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
    regMake(ids, 3).catch(e => regShow('存基准失败', [String((e && e.message) || e)], true));
  } else {
    regRun().catch(e => regShow('回归对照失败', [String((e && e.message) || e)], true));
  }
})();
