/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* ===== 导入规范化：DeepSeek 常见的格式漂移在这里强制纠正 ===== */
/* 这些是对象名，不是分类标签，不能用 ◆ */
const DIGEST_OBJ_TITLE = /^(王中王系统|成就系统|称号系统|个人中心|祈愿规则|祈愿福利|好友系统|交易行|流水查询系统|钻石狂潮)$/;
/* 这些是属性名，不能写成「角色 · 属性」 */
const DIGEST_ATTR = /^(初始法力值|初始生命值|能量消耗|法力值|攻击力|生命值|护甲|魔抗|攻速|移速)$/;
/* 原文没有的空标签行 */
const DIGEST_EMPTY_LABEL = /^(活动说明|说明|规则|备注)[：:]?$/;

/* 只变数字的箭头若名词写了两遍，压缩成「名词 旧 → 新」 */
function normArrowDup(s) {
  return String(s).replace(
    /([^；。→+]{1,40}?)(\d+(?:\.\d+)?)([^\d；。→+]{1,2}?)([^\d；。→][^；。→]{3,29}?)\s*→\s*(\d+(?:\.\d+)?)([^\d；。→+]{1,2}?)\4/g,
    (all, pre, n1, u1, tail, n2, u2) => {
      if (!u1 || u1 !== u2 || u1 === '%' || u2 === '%') return all;
      if (/\d$/.test(pre)) return all;
      /* 名词必须是干净的短语：带冒号 / 括号 / 数字的（「天赋牌【限制性进化】：指定移除1名…」）
         一旦搬到数字前面，语序就乱了，宁可不压缩 */
      if (!/^[\u4e00-\u9fa5]{2,10}$/.test(tail)) return all;
      /* 「名词 旧 → 新」：用冒号分隔；前面已有冒号时直接连写，避免「被动：…攻击力：5点」 */
      const sep = /[：:]/.test(pre + tail) || /[：:，,]$/.test(pre + tail) ? '' : '：';
      return pre + tail + sep + n1 + u1 + ' → ' + n2 + u2;
    }
  );
}

/* 名词被模型只留在箭头右侧、左侧只剩裸数量（「使用1张 → 2张古币」）：把名词补回左侧 */
function normBareQuant(s) {
  return String(s).replace(
    /(\d+(?:\.\d+)?)([张枚个名件点种位条回合层次])\s*→\s*(\d+(?:\.\d+)?)\2([\u4e00-\u9fa5]{1,4})/g,
    (all, n1, u1, n2, noun) => n1 + u1 + noun + ' → ' + n2 + u1 + noun
  );
}

/* 箭头两侧重复的尾缀（如「…的真实伤害 → …的真实伤害」）只保留公式部分 */
function normArrowTailDup(s) {
  return String(s).replace(/([^\d；。→]{2,16}?)\s*→\s*([^；。→]*?)\1(?=[。；，]|$)/g, (all, tail, right, off, str) => {
    if (/\d/.test(tail)) return all;
    const p = tail.lastIndexOf('的');
    if (p <= 0) return all;
    const base = tail.slice(0, p);
    const key = tail.slice(p + 1);
    if (key.length < 2) return all;
    const left = str.slice(0, off);
    const colon = Math.max(left.lastIndexOf('：'), left.lastIndexOf(':'));
    if (colon < 0) return all;
    /* 只看当前这一句冒号前的主干：往上跨句会让上一句的同名词（毒奶「基础技能…和法术伤害」）
       把下一句的尾缀误删，变成「10级技能：10+65%法术攻击力 → 10+45%法术攻击力」 */
    const head = left.slice(Math.max(left.lastIndexOf('；'), left.lastIndexOf('。'), left.lastIndexOf('\n')) + 1, colon);
    if (head.indexOf(key) < 0) return all;
    return base + ' → ' + right + base;
  });
}

/* 同一段说明被模型原样输出两遍（如大乔觉醒前 / 觉醒后写成同一句）时只留一遍 */
function normDescDup(s) {
  const raw = String(s);
  const body = raw.replace(/[。！？\s]+$/, '');
  const segs = body.split('；');
  const n = segs.length;
  if (n < 4 || n % 2) return raw;
  const h = n / 2;
  const half = k => segs.slice(k * h, (k + 1) * h).map(x => x.trim()).join('；');
  const a = half(0), b = half(1);
  if (!a || a !== b) return raw;
  return a + (/[。！？]$/.test(raw) ? raw.slice(-1) : '');
}

/* 「新增：等级+1」这类残句：用同一段里最近的主语补全
   （「大乔的法力值上限永久-5；新增：等级+1」→「…；新增：大乔等级+1」） */
function normNewSubject(s) {
  const str = String(s);
  return str.replace(/新增[：:]\s*((?:临时)?(?:等级|星级))/g, (all, key, off) => {
    const before = str.slice(0, off);
    const owns = before.match(/([\u4e00-\u9fa5·【】]{2,10})的(?:法力值|生命值|护盾|攻击力|法术攻击力|物理攻击力|技能|等级|星级)/g);
    let own = '';
    if (owns && owns.length) {
      const cand = owns[owns.length - 1].split('的')[0];
      if (!/^(你|其|该|此|每|所有|全体|自身|己方|敌方)/.test(cand)) own = cand;
    }
    /* 没有「X的…」时，取新增前末句动词前的主语
       （「你的英雄施加控制效果时，你的【三分】英雄获得20点法术攻击力；新增：临时等级+1」） */
    if (!own) {
      const seg = (before.split(/[；;。]/).filter(Boolean).pop() || '');
      const tail = seg.split(/[，,]/).filter(Boolean).pop() || '';
      const m = tail.match(/^(.{2,16}?)(获得|恢复|受到)/);
      if (m && !/[，。；]/.test(m[1])) own = m[1];
    }
    if (!own) return all;
    return '新增：' + own + key;
  });
}

/* 说明行：压缩重复名词与重复尾缀；不改原文标点（行内句号保持句号，
   避免和公告原文对不上） */
function normDesc(s) {
  return normNewSubject(normDescDup(normBareQuant(normArrowDup(normArrowTailDup(s)))));
}

/* ● 标题：去掉重复的分组名；拆出误写成标题的属性名 */
function normItemTitle(t, grpName) {
  let title = String(t || '').trim();
  const g = String(grpName || '').trim();
  if (g) {
    if (title === g) title = '';
    else if (title.indexOf(g + ' · ') === 0) title = title.slice((g + ' · ').length).trim();
    else if (title.indexOf(g + '·') === 0) title = title.slice((g + '·').length).trim();
  }
  let attr = '';
  const m = title.match(/^(.+?)\s*·\s*(.+)$/);
  if (m && DIGEST_ATTR.test(m[2].trim())) {
    attr = m[2].trim();
    title = m[1].trim();
  }
  return { title, attr };
}

/* 档位 / 属性后缀：属于上一条的说明，不能拼进标题 */
const DIGEST_TIER = /^(基础技能|技能|被动|技能前摇|技能后摇|\d+级|.{0,8}(攻击速度|攻击力|生命值|法力值|护盾|技能范围|冷却|消耗))$/;

/* 分组标记：[棋手调整] / [天赋调整] 这类从层级里漂出来的标签
   （【/新增】是新增标记的结束符，不是分组名，必须排除） */
const DIGEST_GROUP_LABEL = /^[\[【]\s*(?!\/)([^\[\]【】]{1,12}?(?:调整|优化|新增|说明))\s*[\]】]$/;
const DIGEST_GROUP_LABEL_TAIL = /[\[【]\s*(?!\/)([^\[\]【】]{1,12}?(?:调整|优化|新增|说明))\s*[\]】]\s*$/;

/* 正文首行的「技能 / 天赋名：」：拆成胶囊（对象名）+ 加粗标题（技能名），
   和原文里「闹闹」换行「朋友多多」的排版保持一致 */
const LEAD_NAME_BAD = /^(调整前|调整后|觉醒前|觉醒后|基础技能|被动技能|主动技能|技能|被动|主动|普攻|普通攻击|大招|绝技|秘技任务|技能任务|任务|秘技|专属|特性|觉醒|天赋|卡牌|英雄|棋手|注|提示|说明|规则|条件|时间|入口|内容|方式|范围|活动|奖励|消耗|获得|总结|注意|例如|比如|其中|另外|同时|此外)$/;
/* 标题是否是棋手：立绘库的键就是棋手名（内置 20 位，用户载入立绘后自动扩充）。
   命中时「标题 = 对象名」已经确定，拆分可以放宽，不必只靠字数和黑名单猜 */
function isChessName(name) {
  const n = String(name || '').replace(/\s/g, '');
  return !!n && Object.prototype.hasOwnProperty.call(PORTRAITS, n);
}
function splitLeadName(t, d) {
  /* 只认棋手：立绘库里有这个名字，才确定「标题 = 对象名」，正文首行的「XX：」才是技能名。
     不这样做的话，「驭势 / 蒙恬 / 称号系统」这类标题也会被拆，
     把「能量消耗 / 初始法力值 / 新增称号」误当成技能名加粗 */
  const title = String(t || '').trim();
  if (!isChessName(title)) return null;
  const body = String(d || '');
  /* 棋手技能 / 天赋名可能超过 8 字，上限放宽到 12 字 */
  const m = body.match(/^([\u4e00-\u9fa5·]{2,12})[：:]\s*([\s\S]+)$/);
  if (!m) {
    /* 原文「闹闹 / 朋友多多 / 调整前：…」这种换行结构没有冒号：
       首行是技能名，第二行才是数值 */
    const lines = body.split('\n');
    if (lines.length > 1 && /^[\u4e00-\u9fa5·]{2,8}$/.test(lines[0].trim())
        && /^(调整前|调整后|觉醒前|觉醒后|技能前摇|技能后摇|基础技能|被动技能)/.test(lines[1].trim())) {
      const name = lines[0].trim();
      if (LEAD_NAME_BAD.test(name)) return null;
      return { name, rest: lines.slice(1).join('\n').trim() };
    }
    return null;
  }
  const name = m[1], rest = m[2].trim();
  if (LEAD_NAME_BAD.test(name) || rest.length < 2) return null;
  /* 活动时间 / 兑换入口 / 奖励内容 这类说明性前缀不是技能名，保持正文原样 */
  if (/(时间|入口|说明|规则|方式|范围|奖励|内容|条件|价格|数量|概率|地点|地址)$/.test(name)) return null;
  return { name, rest };
}

/* 「6级天赋领取逻辑调整」这类组内规则标题：不是棋手，也不是棋手的技能，
   必须和棋手同级单独成条，不能被吞进上一位棋手的正文或技能。
   只认带等级或「规则 / 逻辑 / 说明」的标题；「武器模式调整」这类
   以「调整」结尾的棋手技能小节不算规则标题 */
const RULE_TITLE_RE = /^(?:\d+\s*级[^，。；:：]{0,20}(?:调整|规则|逻辑|说明)|[^：:，。；]{1,20}(?:规则|逻辑|说明))[：:]?$/;
const isRuleTitle = s => !!s && !isChessName(s) && RULE_TITLE_RE.test(String(s).trim());

/* 皮肤 / 商城售卖这类公告不是棋手的技能，也不是规则条目：
   不能并进上一位棋手的卡里（「新传说皮肤：乔汐-潮汐回响」曾被当成明先生的技能） */
const SHOP_NOTICE_RE = /(皮肤|商城|点券|折扣|售卖|限时|礼包|上架)/;
const isShopNotice = s => SHOP_NOTICE_RE.test(String(s || ''));

/* 棋手 → 技能：一个棋手一张卡，技能是挂在棋手下面的独立子条目（kids）。
   同一个棋手有多个技能调整时各自一条，不会互相覆盖，也不会被拖到别处。
   只在棋手分组（或未分组）里做：英雄「镜」和棋手「镜」同名，不能在英雄组里套立绘规则 */
function buildChessItems(items, grpName) {
  const gname = String(grpName || '').trim();
  if (gname && !/棋手/.test(gname)) return items;

  const out = [];
  const ensureKids = it => {
    if (!Array.isArray(it.kids)) it.kids = [];
    return it.kids;
  };
  const addKid = (parent, t, d) => {
    const kt = String(t || '').trim(), kd = String(d || '').trim();
    if (kt) ensureKids(parent).push({ t: kt, d: kd });
    else if (kd) {
      /* 无标题续段属于紧挨着的上一个技能，接在它正文后面；
         跑到父条目正文里会排到所有技能之前，顺序就乱了 */
      const ks = ensureKids(parent);
      if (ks.length) {
        const lastK = ks[ks.length - 1];
        lastK.d = [String(lastK.d || '').trim(), kd].filter(Boolean).join('\n');
      } else {
        parent.d = [String(parent.d || '').trim(), kd].filter(Boolean).join('\n');
      }
    }
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const t = String(it.t || '').trim();

    /* ①「◆ 庄小鱼」+ 后续若干条技能：全部收进同一个父条目的 kids */
    if (it.sub && isChessName(t)) {
      const parent = { t, d: '', kids: [] };
      let j = i + 1;
      for (; j < items.length; j++) {
        const nx = items[j];
        const nt = String(nx.t || '').trim();
        if (nx.sub) break;
        /* 「6级天赋领取逻辑调整」这类组内规则条目不是棋手的技能，遇到就结束当前棋手块 */
        if (isRuleTitle(nt)) break;
        /* 皮肤 / 商城售卖公告也不能被吞进当前棋手 */
        if (nt && isShopNotice(nt)) break;
        if (!nt) {
          const head = String(nx.d || '').split('\n')[0].trim();
          if (isRuleTitle(head)) break;
        }
        /* 下一位棋手留给外层，不能吞进当前棋手 */
        if (nt && isChessName(nt) && nt !== t) break;
        if (nt && nt !== t) addKid(parent, nt, nx.d || '');
        else {
          /* 无标题、或重复了一遍棋手名：技能名在正文首行「XX：…」里 */
          const lead = splitLeadName(t, nx.d || '');
          if (lead) addKid(parent, lead.name, lead.rest);
          else addKid(parent, '', nx.d || '');
        }
      }
      /* 同一棋手被拆成多个 ◆：并到上一条，避免出现两张同名卡 */
      const last = out[out.length - 1];
      if (last && String(last.t || '').trim() === t && Array.isArray(last.kids)) {
        last.kids.push(...parent.kids);
        last.d = [String(last.d || '').trim(), parent.d].filter(Boolean).join('\n');
      } else out.push(parent);
      i = j - 1;
      continue;
    }

    /* ①-b 平铺棋手名、正文为空：后面紧跟的说明/模式都属于这名棋手，
       全部收进同一张立绘卡的 kids。否则会出现「一张空立绘卡 + 若干张无立绘散卡」。
       遇到下一位棋手、组内规则标题或表格时结束 */
    if (!it.sub && t && isChessName(t) && !it.table && !String(it.d || '').trim()) {
      /* 已经带 skills 的棋手卡（JSON 导入）先原样继承，再往下收后面的散条目 */
      const parent = Object.assign({}, it, {
        d: '',
        kids: Array.isArray(it.kids) ? it.kids.slice() : []
      });
      let j = i + 1;
      for (; j < items.length; j++) {
        const nx = items[j];
        const nt = String(nx.t || '').trim();
        /* ◆ 小标题属于新的分类块，不能吞进当前棋手 */
        if (nx.sub) break;
        if (nx.table) break;
        if (nt && isRuleTitle(nt)) break;
        if (!nt && isRuleTitle(String(nx.d || '').split('\n')[0].trim())) break;
        if (nt && isChessName(nt) && nt !== t) break;
        if (nt === t) { addKid(parent, '', nx.d || ''); continue; }
        if (nt) addKid(parent, nt, nx.d || '');
        else {
          const lead = splitLeadName(t, nx.d || '');
          if (lead) addKid(parent, lead.name, lead.rest);
          else addKid(parent, '', nx.d || '');
        }
      }
      if (!parent.d && !parent.kids.length) { out.push(it); continue; }
      out.push(parent);
      i = j - 1;
      continue;
    }

    /* ①-c「棋手 · 技能」：标题里带分隔符且前半是棋手名时，拆成「棋手卡 + 技能」，
       同一棋手的后续技能并进同一张卡，立绘只画一次
       （马可 · 阳光普照 + 马可 · 重点照顾 → 一张马可卡，卡内两个技能） */
    const chessSplit = str => {
      const m = String(str || '').trim().match(/^(.+?)\s*[·・]\s*(.+)$/);
      return m && isChessName(m[1].trim()) ? { who: m[1].trim(), skill: m[2].trim() } : null;
    };
    if (!it.sub && !it.table) {
      const cs = chessSplit(t);
      if (cs) {
        const prevCs = out[out.length - 1];
        if (prevCs && String(prevCs.t || '').trim() === cs.who && Array.isArray(prevCs.kids)) {
          addKid(prevCs, cs.skill, it.d || '');
        } else {
          out.push(Object.assign({}, it, {
            t: cs.who,
            d: '',
            /* 标题里的技能排最前，已带的技能（JSON 导入）原样保留在后面 */
            kids: [{ t: cs.skill, d: String(it.d || '').trim() }]
              .concat(Array.isArray(it.kids) ? it.kids : [])
          }));
        }
        continue;
      }
    }

    /* ② 平铺「庄小鱼」+ 正文首行「梦幻引擎：…」→ 父条目 + 一个技能 */
    if (!it.sub && t && isChessName(t) && String(it.d || '').trim()) {
      const lead = splitLeadName(t, it.d);
      if (lead) {
        /* 同一个棋手又出现一条（第二个技能）→ 挂进上一条的 kids，不另起一张卡 */
        const last = out[out.length - 1];
        if (last && Array.isArray(last.kids) && String(last.t || '').trim() === t) {
          addKid(last, lead.name, lead.rest);
        } else {
          out.push(Object.assign({}, it, {
            t,
            d: '',
            /* 正文首行拆出的技能排最前，已带的技能（JSON 导入）原样保留在后面 */
            kids: [{ t: lead.name, d: lead.rest }]
              .concat(Array.isArray(it.kids) ? it.kids : [])
          }));
        }
        continue;
      }
    }

    /* ③ 同一棋手的下一条 → 并入上一条的 kids（一个棋手多个技能） */
    const prev = out[out.length - 1];
    if (!it.sub && t && prev && isChessName(t) && String(prev.t || '').trim() === t && !it.table) {
      const lead = String(it.d || '').trim() ? splitLeadName(t, it.d) : null;
      if (lead) addKid(prev, lead.name, lead.rest);
      else if (String(it.d || '').trim()) addKid(prev, '', it.d);
      continue;
    }

    /* ③-b 棋手卡后面紧跟的无标题段（○）属于这名棋手：
       挂进 kids，避免变成一张张没有立绘的散卡，也能按段边界分页 */
    const owner = out[out.length - 1];
    if (!it.sub && !t && owner && isChessName(owner.t) && !it.table) {
      const head = String(it.d || '').split('\n')[0].trim();
      if (!isRuleTitle(head)) {
        ensureKids(owner).push({ t: '', d: String(it.d || '').trim() });
        continue;
      }
    }

    /* ④ 无标题、正文首行是「6级天赋领取逻辑调整」这类规则标题 →
       提升为与棋手同级的独立条目，标题独占一行，不再当正文 */
    if (!it.sub && !t) {
      const ls = String(it.d || '').split('\n');
      const head = (ls[0] || '').trim();
      if (isRuleTitle(head)) {
        out.push(Object.assign({}, it, { t: head, d: ls.slice(1).join('\n').trim() }));
        continue;
      }
    }

    /* ⑤ 棋手组里「棋手 · 技能」卡后面的裸名称：补上棋手前缀，
       否则同一名棋手的第二个天赋会变成一张无主散卡、也没有立绘
       （马可 · 阳光普照 + 重点照顾 → 马可 · 重点照顾） */
    const own = out[out.length - 1];
    if (!it.sub && t && own && !it.table && !isRuleTitle(t)
      && !isChessName(t) && !/[·・]/.test(t) && !isShopNotice(t)) {
      const sc = String(own.t || '').trim().match(/^(.+?)\s*[·・]\s*(.+)$/);
      if (sc && isChessName(sc[1].trim())) {
        out.push(Object.assign({}, it, { t: sc[1].trim() + ' · ' + t }));
        continue;
      }
      if (isChessName(own.t)) { addKid(own, t, it.d || ''); continue; }
    }

    out.push(it);
  }
  return out;
}

/* 分类小标题（三级标签）：这几个名字本身就是小标题，
   导入数据漏标 sub 时也要纠正，不能排成普通条目（正文） */
const SUB_LABEL_RE = /^(英雄技能调整|卡牌效果调整|对局选人方式调整|受击回蓝调整)$/;

/* 标签名比较：去掉结尾的「调整 / 优化 / 说明」后相同也算重复
   （◆ 受击回蓝调整 / ● 受击回蓝调整、◆ 6级天赋领取逻辑调整 / ● 同名） */
function sameLabel(a, b) {
  const core = s => String(s || '').trim().replace(/(调整|优化|说明)$/, '');
  const x = String(a || '').trim(), y = String(b || '').trim();
  return !!x && !!y && (x === y || (core(x) && core(x) === core(y)));
}

/* ◆ 标签是「分类名」还是「条目名」：
   分类名下面跟着多条内容（受击回蓝调整 / 6级天赋领取逻辑调整…），标签必须留着；
   其余 ◆（马可 · 阳光普照、光棱塔、限制性进化…）就是条目名，后面紧跟的正文属于它 */
const SUB_CATEGORY_TAIL = /(调整|优化|说明|规则|逻辑|方式)$/;
function isSubCategoryName(s) {
  const x = String(s || '').trim();
  if (!x) return true;
  if (/[·・]/.test(x)) return false;
  if (SUB_LABEL_RE.test(x) || DIGEST_EMPTY_LABEL.test(x) || DIGEST_GROUP_LABEL.test(x)) return true;
  return SUB_CATEGORY_TAIL.test(x);
}

/* ◆ 标签下面一条内容都没有：AI 把整段观感类删了、标签却忘了删。
   后面紧跟另一个 ◆、或者已经是分组末尾，说明它没挂任何内容，标签一起删；
   「◆ 标签 + 下面挂 ● 条目」这种有下级的照常保留 */
function dropEmptyLabels(items) {
  /* 挂着技能子条目的棋手卡不是空标签：它的内容在 kids 里，删掉会连技能一起丢 */
  const hasKids = it => Array.isArray(it.kids) && it.kids.length > 0;
  const bare = it => !hasKids(it) && !String(it.d || '').trim() && (it.sub || String(it.t || '').trim());
  return items.filter((it, i) => {
    if (!bare(it)) return true;
    const next = items[i + 1];
    return !!next && !next.sub;
  });
}

/* 原文「一句概述 + 一句展开」被 AI 两句都抄了（同一件事写两遍）：
   同一分组里相邻的无标题说明，短的那句每个字都出现在长的那句里、
   且长句至少两倍长，判定为重复，只留长句 */
function dedupeCoveredLines(items) {
  const plain = s => String(s || '').replace(/[\s，。；、：:！!？?“”"'‘’（）()《》【】\-—…]/g, '');
  return items.filter((it, i) => {
    if (it.sub || String(it.t || '').trim()) return true;
    const me = plain(it.d);
    if (me.length < 6) return true;
    return !items.some((other, j) => {
      if (j === i || other.sub || String(other.t || '').trim()) return false;
      const big = plain(other.d);
      if (big.length < me.length * 2) return false;
      for (const ch of me) if (big.indexOf(ch) < 0) return false;
      return true;
    });
  });
}

/* 导入后统一纠偏：
   1) 「蒙恬 · 攻击力」这类属性误写成标题 → 拆回「蒙恬」+ 正文前缀「攻击力：…」
   2) ◆ 标题 + 紧跟的无标题正文 → 合成一张「标题 + 正文」卡
   3) 相邻同名条目被拆开 → 正文合并回一条
   4) [棋手调整] 这类独占标签 → 提升为分组名，后续条目归入该组 */
function normalizeSections(sections) {
  const cleanName = s => String(s || '').replace(/^[\[【]\s*|\s*[\]】]$/g, '').trim();
  (sections || []).forEach(sec => {
    const nextGroups = [];
    /* 章节标题下、第一个小标题之前的导语会落在以章节名命名的分组里：
       分组名和章节标题相同就不再重复显示（页面顶部已经有章节标题） */
    const secName = cleanName(sec.name || sec.title);
    (sec.groups || []).forEach(grp => {
      let cur = { name: cleanName(grp.name), items: [] };
      if (secName && cur.name === secName) cur.name = '';
      const flush = () => {
        if (!cur.items.length) return;
        /* AI 常把原文的 ◆ 条目升成【同名分组】、再重复写一条同名条目：这里只留一层。
           条目是 ◆ → 去掉那条 ◆，内容直接挂在分组下；
           条目是 ● → 去掉分组名，只留条目卡 */
        const first = cur.items[0];
        if (cur.name && first && first.sub && sameLabel(cur.name, first.t)) {
          cur.items.shift();
          if (!cur.items.length) return;
        }
        if (cur.name && cur.items.length === 1 && !cur.items[0].sub && sameLabel(cur.name, cur.items[0].t)) {
          cur.name = '';
        }
        nextGroups.push(cur);
      };
      /* 由「◆ 条目名 + 无标题正文」合成的卡：后续无标题续段接在它后面 */
      let subCard = null;

      (grp.items || []).forEach(raw => {
        let sub = !!raw.sub;
        let t = String(raw.t || '').trim();
        let d = normNewSubject(String(raw.d || '').trim());

        /* 「● 安琪拉 · 首次秘技」+「首次秘技只会从…」：所谓技能名其实是正文开头的几个字。
           原文没有独立技能名行（没有「技能名：」、也没有单独一行），拆出来会变成加粗标题、
           正文又重复一遍。正文以技能名开头且后面不是冒号时，把技能名退回正文。 */
        if (!sub) {
          const sk = t.match(/^(.+?)\s*[·・]\s*(.+)$/);
          if (sk && isChessName(sk[1].trim())) {
            const sname = sk[2].trim();
            if (sname && d.indexOf(sname) === 0 && !/^[：:]/.test(d.slice(sname.length))) t = sk[1].trim();
          }
        }

        /* 紧跟同名 ◆ 标签的重复标题（JSON 导入同样适用）：标题只保留标签那份；
           中间可能夹着无标题正文，比较时跳过这些正文 */
        let k = cur.items.length - 1;
        while (k >= 0 && !String(cur.items[k].t || '').trim()) k--;
        const lastNamed = k >= 0 ? cur.items[k] : null;
        if (!sub && t && lastNamed && lastNamed.sub && sameLabel(lastNamed.t, t)) t = '';

        /* 分类小标题被漏标成普通条目时，按小标题纠正；
           若它下面还带着说明，说明另起一条，标签本身只当小标题 */
        if (!sub && SUB_LABEL_RE.test(t)) {
          sub = true;
          if (d) {
            cur.items.push({ t, d: '', sub: true });
            cur.items.push({ t: '', d });
            return;
          }
        }

        /* 整条就是 [棋手调整]：它是分组名，不是条目 */
        const label = !sub && t.match(DIGEST_GROUP_LABEL);
        if (label) {
          flush();
          cur = { name: label[1].trim(), items: [] };
          return;
        }

        /* 说明末尾挂着 [天赋调整]：剥掉标签，后面的条目归入新分组 */
        let afterGroup = '';
        const tail = !sub && d.match(DIGEST_GROUP_LABEL_TAIL);
        if (tail) {
          d = d.slice(0, tail.index).replace(/[；;，,、\s]+$/, '').trim();
          afterGroup = tail[1].trim();
        }

        if (!sub) {
          const m = t.match(/^([^·・]+?)\s*[·・]\s*(.+)$/);
          if (m && DIGEST_TIER.test(m[2].trim())) {
            d = m[2].trim() + (d ? '：' + d : '');
            t = m[1].trim();
          }
        }

        /* 标题本身就属于新分组（如「6级天赋领取逻辑调整」+ 尾标 [天赋调整]）：
           先切组再入组，别把这条留在上一组 */
        let switched = false;
        if (afterGroup && t) {
          const core = afterGroup.replace(/(调整|优化|新增|说明)$/, '');
          if (core.length >= 2 && t.indexOf(core) >= 0 && afterGroup !== cur.name) {
            flush();
            cur = { name: afterGroup, items: [] };
            switched = true;
          }
        }

        const out = cur.items;
        const prev = out[out.length - 1];
        /* 正文首行重复了一遍对象名（「庄小鱼：…」）→ 只留正文。
           「庄小鱼」+「梦幻引擎：…」这种棋手 → 技能，先原样入组，
           等分组整理完由 buildChessItems 收成「父条目 + kids」 */
        const lead = !sub && t && d && (!cur.name || /棋手/.test(cur.name)) ? splitLeadName(t, d) : null;
        if (lead && lead.name === t) d = lead.rest;
        /* ◆ 标签 + 紧跟的无标题正文：标签是「受击回蓝调整」这类分类名时保留标签（下面还有多条），
           否则它就是条目名（马可 · 阳光普照、光棱塔…），和正文合成一张卡 */
        if (!sub && !t && d && prev && prev.sub && !isSubCategoryName(prev.t)) {
          out[out.length - 1] = { t: prev.t, d };
          subCard = out[out.length - 1];
        } else if (!sub && !t && d && subCard && prev === subCard) {
          /* 这张卡后面的无标题续段（○）也属于它，别另起一张无标题散卡 */
          subCard.d = [String(subCard.d || '').trim(), d].filter(Boolean).join('\n');
        } else if (!sub && t && prev && !prev.sub && String(prev.t || '').trim() === t && d && !isChessName(t)) {
          /* 同名条目合并正文；棋手同名条目交给 buildChessItems 拆成多个技能 */
          prev.d = [String(prev.d || '').trim(), d].filter(Boolean).join('\n');
        } else if (t || d) {
          const item = Object.assign({}, raw, { t, d });
          if (sub) item.sub = true;
          out.push(item);
        }

        if (afterGroup && !switched && afterGroup !== cur.name) {
          flush();
          cur = { name: afterGroup, items: [] };
        }
      });
      flush();
    });

    /* 相邻同名分组合并，避免 [英雄调整] 与原有「英雄调整」组并排出现 */
    const merged = [];
    nextGroups.forEach(g => {
      g.name = cleanName(g.name);
      const last = merged[merged.length - 1];
      if (last && last.name === g.name) last.items.push(...g.items);
      else merged.push(g);
    });
    merged.forEach(g => {
      g.items = buildChessItems(dedupeCoveredLines(dropEmptyLabels(g.items)), g.name);
    });
    sec.groups = merged;
  });
  /* 分组整理完再做并表：同一分组内连续的同形态纯数值调整 → 三列表格 */
  mergeValueTables(sections);
  return sections;
}

