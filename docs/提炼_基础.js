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

/* ====================  公告列表（自动取最新）  ==================== */
/* 列表接口要签名 sign = md5(密钥 + source + serviceId + 时间戳)，与监控脚本同一套。
   网页里没有 node，所以自带一份 md5（RFC 1321，已在 node 下与 crypto 对比一致） */
const LIST_API = 'https://apps.game.qq.com/cmc/cross';
const LIST_SECRET = '9784d353d1f9ca34a59b61752630dade';

function md5(str) {
  function toBytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c < 0xd800 || c >= 0xe000) { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
      else {
        i++;
        c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }
  const add32 = (a, b) => (a + b) & 0xffffffff;
  const rol = (n, c) => (n << c) | (n >>> (32 - c));
  const bytes = toBytes(str);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let off = 0; off < bytes.length; off += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) {
      M[i] = bytes[off + i * 4] | (bytes[off + i * 4 + 1] << 8) | (bytes[off + i * 4 + 2] << 16) | (bytes[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = add32(add32(F, A), add32(K[i], M[g]));
      A = D; D = C; C = B;
      B = add32(B, rol(F, S[(i >> 4) * 4 + (i % 4)]));
    }
    a0 = add32(a0, A); b0 = add32(b0, B); c0 = add32(c0, C); d0 = add32(d0, D);
  }
  const hex = n => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function loadNewsList(limit) {
  return new Promise((resolve, reject) => {
    const ts = String(Math.round(Date.now() / 1000));
    const sign = md5(LIST_SECRET + 'web_pc' + '389' + ts);
    const q = [
      'serviceId=389', 'withtop=yes', 'logic=or', 'typeids=1,2', 'sortby=sIdxTime',
      'r1=userobj', 'start=0', 'limit=' + (limit || 12), 'source=web_pc',
      'filter=channel', 'exclusiveChannel=40', 'exclusiveChannelSign=' + sign,
      'time=' + ts, 'chanid=7061'
    ].join('&');
    window.userobj = null;
    const sc = document.createElement('script');
    sc.src = LIST_API + '?' + q;
    let done = false;
    const timer = setTimeout(() => finish(new Error('公告列表请求超时')), 15000);
    function finish(err, val) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sc.remove();
      err ? reject(err) : resolve(val);
    }
    sc.onload = () => {
      const o = window.userobj;
      if (o && o.status === 0 && o.data && o.data.items) {
        finish(null, o.data.items.map(it => ({
          id: String(it.iNewsId || ''),
          title: String(it.sTitle || '').trim(),
          time: it.sIdxTime || ''
        })).filter(it => it.id));
      } else {
        finish(new Error('公告列表接口返回异常'));
      }
    };
    sc.onerror = () => finish(new Error('公告列表请求失败'));
    document.head.appendChild(sc);
  });
}

/* 最新一篇「更新公告」：跳过「预告」类（只有时间地点，没有正文调整） */
function pickLatest(list) {
  const upd = (list || []).filter(it => /更新/.test(it.title));
  const main = upd.filter(it => !/预告/.test(it.title));
  return main[0] || upd[0] || (list || [])[0] || null;
}

