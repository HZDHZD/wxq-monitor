/* ==== 特殊库：官方名单外的专有名词（模块 / 玩法 / 系统名） ====
   出图页「新增条目 / 新增分组 / 新增技能」时填的标题会自动追加到这里；
   公告提炼解析时，整行命中这里就按标题处理。
   想删掉某个词，直接删数组里的那一行即可。 */
window.LEX_SPECIAL = [];

/* 归一化：引号、空格、间隔号、括号都不算内容 */
window.specialNorm = function (s) {
  return String(s == null ? '' : s)
    .replace(/[\uE000-\uF8FF\uFFFD]/g, '')
    .replace(/[\s·・．.：:“”‘’"'「」『』（）()【】\[\]]/g, '');
};

/* 比对用的键：去掉「模块 / 玩法 / 系统」后缀；
   但后缀前只剩 1～2 个字时不脱，避免「核心玩法」被缩成「核心」到处误命中 */
window.specialKey = function (s) {
  const k = window.specialNorm(s);
  const stem = k.replace(/(模块|玩法|系统)$/, '');
  return stem.length >= 3 ? stem : k;
};

/* 出图页新增的标题能不能进特殊库：太长、带句号、结构词都不收 */
window.specialUsable = function (s) {
  const t = String(s == null ? '' : s)
    .replace(/[\uE000-\uF8FF\uFFFD]/g, '')
    .replace(/[“”‘’"「」『』]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!t || t.length > 14) return '';
  /* 「新玩法」「新系统」这类通用词脱掉后缀只剩一个字，不收 */
  if (t.replace(/(模块|玩法|系统)$/, '').length < 2) return '';
  if (/[。！？；，、：:]/.test(t)) return '';
  if (/^(调整前|调整后|觉醒前|觉醒后|改动前|改动后|修改前|修改后|注|活动|兑换|祈愿|版本|更新)/.test(t)) return '';
  if (/(调整|更新|修复|说明|优化|新增|开启|关闭)$/.test(t)) return '';
  /* 「棋手 · 技能」这种组合标题是展示用的，别记进小抄 */
  if (t.indexOf('·') >= 0) return '';
  return t;
};
