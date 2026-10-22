/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
/* ====================  基础工具  ==================== */
const API = 'https://apps.game.qq.com/wmp/v3.1/public/searchNews.php';
const $ = s => document.querySelector(s);

let curMeta = { date: '', server: '正式服', title: '' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function clean(s) {
  return String(s || '')
    /* 原文常带图标字体的私用区字符（U+E000–U+F8FF）和解码残留（U+FFFD），
       换到我们自己的字体后只会显示成方块，直接丢掉 */
    .replace(/[\uE000-\uF8FF\uFFFD]/g, '')
    .replace(/\s+/g, ' ')
    /* 原文的 &nbsp; 解码后是普通空格，常落在标点前（「排序。 。」「： ；」）：
       先吃掉标点前的空格，再把连续标点折叠，避免输出里出现空标点 */
    .replace(/\s+([，,。．.；;：:、！？!?）)】」》])/g, '$1')
    .replace(/([（(【「《])\s+/g, '$1')
    .replace(/([：:])\s*[；;]/g, '$1')
    .replace(/([。．.])\s*[。．.]/g, '$1')
    .replace(/([；;])\s*[；;]/g, '$1')
    .replace(/([，,])\s*[，,]/g, '$1')
    .trim();
}

function setStatus(msg, type) {
  const el = $('#status');
  el.textContent = msg || '';
  el.className = type || '';
}

/* ====================  抓取  ==================== */
function newsIdFrom(input) {
  const s = String(input || '').trim();
  const m = s.match(/newsid=(\d+)/i);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}

function loadNews(id) {
  return new Promise((resolve, reject) => {
    window.searchObj = null;
    const sc = document.createElement('script');
    sc.src = API + '?p0=389&source=web_pc&id=' + encodeURIComponent(id) + '&_=' + Date.now();
    let done = false;
    const timer = setTimeout(() => finish(new Error('请求超时，请检查网络后重试')), 15000);
    function finish(err, val) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sc.remove();
      err ? reject(err) : resolve(val);
    }
    sc.onload = () => {
      const o = window.searchObj;
      if (o && o.msg && o.msg.sContent) finish(null, o.msg);
      else finish(new Error('接口未返回正文，可能公告已下架'));
    };
    sc.onerror = () => finish(new Error('网络请求失败，可展开下方手动粘贴'));
    document.head.appendChild(sc);
  });
}

