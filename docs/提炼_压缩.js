/* 本文件由 公告提炼.html 拆出，按函数名定位（行号会漂移） */
function compressPair(b, a) {
  b = b.trim(); a = a.trim();
  if (!b || !a || b === a) return b || a;
  a = stripLeadConj(b, a);
  /* 两侧能切成同样多的句子（≥2 句）时按句对齐、逐句压缩：
     整段压成一个长箭头时，左侧整段保留、右侧整段重写，
     第一句里新增的触发时机就会藏进右侧文字里读不出来
     （班叔「比赛开始时，获得1张便携式机关」→「开局及棋手5级时获得1张便携式机关」）。
     相同的句子只写一次 */
  const bs = sentences(b), as = sentences(a);
  if (bs.length >= 2 && bs.length === as.length && !/\n/.test(b + a)) {
    const out = [];
    for (let i = 0; i < bs.length; i++) {
      if (bs[i] === as[i]) { if (out[out.length - 1] !== bs[i]) out.push(bs[i]); continue; }
      out.push(compressPair(bs[i], as[i]));
    }
    if (out.length) return out.join('');
  }
  /* 调整后只在末尾多一句括号说明（红莲炎甲「（生命恢复包含吸血效果）」）：
     括号不属于变化内容，先压完正文再把它贴回末尾，否则正文的公共后缀对不齐 */
  const tailM = a.match(/([。；]?)（([^（）]{1,60})）$/);
  if (tailM && tailM.index > 0 && !b.includes('（' + tailM[2] + '）')) {
    /* 括号前的句号要一起摘掉：调整前被 stripAdjust 去掉了句号，右侧留着句号
       会让公共后缀对不上（红莲炎甲「吸血效果，持续3秒 → 护盾效果，持续3秒」） */
    const a2 = a.slice(0, tailM.index);
    /* 括号本身参与变化时不能这么拆（蒙犽「（至多20枚）→（至多30枚）」） */
    if (!b.startsWith(a2) && !a2.startsWith(b)) {
      const head = compressPair(b, a2);
      /* 括号只存在于调整后：它是新增的限定/补充说明，直接贴回会读成两版共有。
         但调整前末尾也有括号时（王牌对决「（基础分+30，加成100%：+30）」→
         「（…400%：+120）」），括号内容本身参与变化，不能标成新增。
         只有当括号是整段追加（a2 就是调整前原文）时才无条件标新增 */
      const bTail = /[。；]?（[^（）]{1,60}）$/.test(b);
      return (a2 === b || !bTail)
        ? markNewNote(head, '（' + tailM[2] + '）')
        : head + '（' + tailM[2] + '）';
    }
  }
  /* 两版把分句内容调换了位置（「获得1张同名牌；胜利再得2张」→「获得1张英雄牌；
     胜利再得1张同名牌」）：开头结尾都对不上、中间一大段又要整段重写，硬压只会把
     箭头插进两条结构不同的句子中间。这种直接整句对整句，不共享任何片段 */
  const big = bigRewrite(b, a);
  if (big) return big;
  let p = 0;
  const n = Math.min(b.length, a.length);
  while (p < n && b[p] === a[p]) p++;
  /* 不要把数字、百分比、乘号这类 token 从中间切开（如 +10 → +12、×1.5 → ×2） */
  while (p > 0 && p < b.length && TOKEN_RE.test(b[p - 1]) && TOKEN_RE.test(b[p])) p--;
  /* 公共前缀末尾的「数字+量词」要保留在右侧，避免「2名A → B」丢掉数量；
     但某一侧已经整句相同时不要再回退，否则会把「永久-5」压成「-5 → 5」 */
  const mq = b.slice(0, p).match(QUANT_RE);
  if (mq && p < b.length && p < a.length && !/^[0-9]/.test(b.slice(p)) && !/^[0-9]/.test(a.slice(p))) p -= mq[0].length;
  /* 不要从括号中间切开，整段括号留给两侧 */
  let depth = 0, openAt = -1;
  for (let i = 0; i < p; i++) {
    if (OPEN_BR.includes(b[i])) { if (!depth) openAt = i; depth++; }
    else if (CLOSE_BR.includes(b[i]) && depth) depth--;
  }
  if (depth > 0 && openAt >= 0) p = openAt;
  let pre = b.slice(0, p), lb = b.slice(p), la = a.slice(p);
  /* 「提升至 / 调整为」这类叙述词留在前缀里：它是两版共有的原文，
     去掉后同一篇公告里会出现「光辉伤害17% → 10+20%」和
     「导弹伤害提升至30+80% → 30+90%」两种写法 */
  /* 公共前缀把并列连词切到两侧之后（「…100%暴击率」+「并无敌 / 和70%伤害减免」），
     同样去掉右侧那个没有承接对象的连词。
     左支已经被前缀吃空（lb 为空）时不剥：这里的「且」是追加连接词，
     后面的追加分支要靠它决定写「，且」还是「，」（大乔「…永久-5且等级+1」） */
  if (lb) la = stripLeadConj(lb, la);
  /* 公共前缀以连词收尾时，这个连词属于两侧并列的成分：留在前缀里会让右支
     丢掉连词，读成整体替换（红莲炎甲「…生命恢复和吸血效果 → 护盾效果」）。
     把连词带回箭头两侧，写成「和吸血效果 → 和护盾效果」 */
  const conjM = pre.match(/(?:以及|和|与|及|或|、)$/);
  let conjDup = false;
  if (conjM && lb && la) {
    const prev = pre.slice(0, -conjM[0].length);
    /* 连词连接的上一项两版都没变时，把它复制到右支：
       「生命恢复和吸血效果 → 生命恢复和护盾效果」比只复制连词
       （「→ 和护盾效果」）更能看清只换了后一项 */
    const segM = prev.match(/[\u4e00-\u9fa5·]{2,8}$/);
    if (segM && !la.startsWith(segM[0])) {
      la = segM[0] + conjM[0] + la;
      conjDup = true;
    } else {
      pre = prev;
      lb = conjM[0] + lb;
      la = conjM[0] + la;
    }
  }
  /* 「第6/10回合 → 6/11回合」：公共前缀里的「第」只留在左边，右支成了残句，
     箭头两侧都带上「第」 */
  const ordPrefix = /第$/.test(pre) && /^[0-9]/.test(lb) && /^[0-9]/.test(la) ? '第' : '';
  /* 调整后只是在调整前末尾追加内容（大乔「永久-5」→「永久-5且等级+1」、
     魔律之刃追加「近战英雄总上限70%」）：不能只留调整后，要写清新增了什么 */
  if (!lb) {
    /* 「调整后只补了一句括号说明」：括号是新增内容，跟正文一起标新增 */
    if (/^[。；]?（[^（）]{1,60}）$/.test(la))
      return markNewNote(b, la.replace(/^[。；]/, ''));
    /* 同一句里追加（「…获得20点法术攻击力且临时等级+1」「…永久-5且等级+1」）：
       用「且」接在原有效果后面，新增段末尾标「（新增）」，读者一眼能看出
       触发条件没变、只是多了一条效果；不要用「；」另起一句，那会读成两条规则 */
    const sameM = la.match(/^([，,、]?\s*(?:并且|并|且|同时|还)?)\s*/);
    if (sameM && sameM[1] && !/[。；]/.test(sameM[1])) {
      let add = la.slice(sameM[1].length).replace(/^[。；\s]+/, '').replace(/[。；\s]+$/, '');
      /* 「，以及10点护甲」：连词不能留在新增区间里（「且【新增】以及10点护甲」），
         提出来当连接符 */
      let conjAdd = '';
      const am = add.match(/^(以及|和|与|及)/);
      if (am) {
        conjAdd = am[1];
        add = add.slice(conjAdd.length).replace(/^[。；，、：:\s]+/, '').replace(/[。；\s]+$/, '');
      }
      if (add) {
        /* 新增的是一条带自己触发条件的规则（「每回合开始时，恢复2点生命」），
           或本身已是多句（「获得1张古币。古币牌只能…」）：另起一句整体标新增 */
        if (isOwnRule(add) || /[。；]/.test(add)) {
          return b.replace(/[。；\s]+$/, '') + '。【新增】' + add + '（新增）【/新增】。';
        }
        /* 原文是顿号列举（「获得20点法术攻击力、临时等级+1」）就保留顿号；
           前半句只是触发条件（「施法时」）时用逗号，不能写「且」；
           前半句本身以「：」「，」收尾时不再补连接符，避免「100级：，」。
           「永久-5」这种减号在数字前的写法不算谓语关键词，但确实是效果，
           也要认成有谓语（大乔「…永久-5且等级+1」要写「，且」而不是「，」） */
        const bHasEffect = hasPred(b) || /[+\-×\/]\s*[0-9]/.test(b);
        const conn = conjAdd ? '，以及' :
          (/[：:，,、；;]$/.test(b) ? '' : (/、/.test(sameM[1]) ? '、' :
            (/且|并|同时|还/.test(sameM[1]) && bHasEffect ? '且' : '，')));
        return b + conn + '【新增】' + add + '（新增）【/新增】';
      }
    }
    /* 先剥掉原文可能自带的「新增：」，统一交给下面的逻辑补「（新增）」 */
    let extra = la.replace(/^[。；，、且并和及：:\s]+/, '').replace(/^新增[：:]\s*/, '').replace(/[。；\s]+$/, '');
    if (!extra) return b;
    /* 「以及/和/与/及」是并列连词，提出来当连接符，
       避免写成「且【新增】以及10点护甲」 */
    let andConj = '';
    const andM = extra.match(/^(以及|和|与|及)/);
    if (andM) {
      andConj = '以及';
      extra = extra.slice(andM[1].length).replace(/^[。；，、：:\s]+/, '');
    }
    if (!extra) return b;
    /* 追加的是一条带自己触发条件的规则（「每回合开始时，恢复2点生命」），
       或本身已是多句（「获得1张古币。古币牌只能…」）：另起一句整体标新增，
       避免「且」把两条不同条件的规则粘成一条 */
    if (isOwnRule(extra) || /[。；]/.test(extra)) {
      return b.replace(/[。；\s]+$/, '') + '。【新增】' + extra + '（新增）【/新增】。';
    }
    /* 追加内容把前半句的主语又抄了一遍
       （「…你的【三分】英雄获得20点攻击力。你的【三分】英雄临时等级+1」）：
       主语已经交代过，省掉，避免「且你的【三分】英雄…」读成另一个对象。
       只剥前半句末分句的开头，且前缀不能带谓语/标点，剥完必须还剩谓语 */
    let stripped = false;
    const lastClause = b.split(/[，,；;。]/).pop() || '';
    /* 「等级+1」「星级+1」没有动词，也算变化内容，不能当成纯名词剥掉 */
    const hasEffect = t => hasPred(t) || /[0-9][+\-×\/]|等级|星级/.test(t);
    for (let k = Math.min(16, extra.length - 2); k >= 2; k--) {
      const head = extra.slice(0, k), rest = extra.slice(k);
      if (!lastClause.startsWith(head)) continue;
      if (/[，,；;。：:]/.test(head) || hasPred(head)) continue;
      if (!hasEffect(rest) || /^[的，,；;。、：:]/.test(rest)) continue;
      extra = rest;
      stripped = true;
      break;
    }
    /* 原文常省略主语（「…永久-5等级+1」），只剩「等级+1」时用前半句
       最近的主语补上（「大乔的法力值上限…」→「大乔等级+1」）；
       上面刚剥掉重复主语的不要再补回来 */
    if (!stripped && /^(临时)?(等级|星级)/.test(extra)) {
      const owns = b.match(/([\u4e00-\u9fa5·【】]{2,10})的(?:法力值|生命值|护盾|攻击力|法术攻击力|物理攻击力|技能|等级|星级)/g);
      let own = '';
      if (owns && owns.length) {
        const cand = owns[owns.length - 1].split('的')[0];
        if (!/^(你|其|该|此|每|所有|全体|自身|己方|敌方)/.test(cand)) own = cand;
      }
      /* 没有「X的…」结构时，取末句动词前的主语
         （「…控制效果时，你的【三分】英雄获得20点法术攻击力」→「你的【三分】英雄」） */
      if (!own) {
        const tail = b.split(/[，,]/).pop() || '';
        const m = tail.match(/^(.{2,16}?)(获得|恢复|受到)/);
        if (m && !/[，。；]/.test(m[1])) own = m[1];
      }
      if (own) extra = own + extra;
    }
    /* 追加内容只是「总上限70%」这类名词短语时缺谓语，读不出是改成多少：
       数值前补「为」（魔律之刃「近战英雄总上限为70%」）；「等级+1」这类
       带运算符的增量不动 */
    if (/[0-9]+(?:\.[0-9]+)?%?$/.test(extra) && !/[+\-×\/][0-9]/.test(extra) &&
      !/[为是到至升降低增减获提达变：:]/.test(extra)) {
      extra = extra.replace(/([0-9]+(?:\.[0-9]+)?%?)$/, '为$1');
    }
    const bb = b.replace(/[。；\s]+$/, '');
    const sep = andConj ? (/[，,]$/.test(bb) ? '以及' : '，以及') :
      (/[：:，,、]$/.test(bb) ? '' : (hasPred(b) ? '，且' : '，'));
    return bb + sep + '【新增】' + extra + '（新增）【/新增】' + (/[。！？]$/.test(b) ? '。' : '');
  }
  if (!la) return b + ' → 删除';
  /* 已把上一并列项复制到右支，不再剥公共后缀，否则会剥成「吸血 → 生命恢复和护盾效果」 */
  if (conjDup) return pre + lb + ' → ' + ordPrefix + la;
  /* 两侧只有括号里的内容不同：压缩括号内部，避免出现「（至多20枚） → 30枚）」 */
  const oi = OPEN_BR.indexOf(lb[0]);
  const cb = oi >= 0 ? CLOSE_BR[oi] : '';
  if (oi >= 0 && la[0] === lb[0] && lb[lb.length - 1] === cb && la[la.length - 1] === cb) {
    return pre + lb[0] + compressPair(lb.slice(1, -1), la.slice(1, -1)) + cb;
  }
  /* 两侧共有的后缀（庄周「…，且技能范围扩大至全体友军」）只保留一次，
     否则箭头右侧会把未变内容再抄一遍 */
  let sb = 0;
  const mn = Math.min(lb.length, la.length);
  while (sb < mn && lb[lb.length - 1 - sb] === la[la.length - 1 - sb]) sb++;
  /* 公共后缀不能从一个数值中间开始：「恢复10% → 200+20%最大生命值」两版末位
     都是 0，后缀会从「0%最大生命值」开始，左支只剩一个「1」；同样「15%伤害减免
     → 20%伤害减免」「17%法术攻击力 → 10+20%法术攻击力」里的「%」也是左值自己
     的一部分。把切点挪到数值边界（数字/小数点/百分号之外）再比 */
  const VAL_CH = /[0-9.%％]/;
  while (sb > 0 && sb < mn && VAL_CH.test(lb[lb.length - sb]) && VAL_CH.test(lb[lb.length - sb - 1])) sb--;
  const suf = lb.slice(lb.length - sb);
  /* 调整后把调整前整句包住（庄周「护盾量提升至700，且技能范围扩大至全体友军」）：
     这时箭头两侧是包含关系而非替换关系，写成「原有效果且新增效果（新增）」 */
  if (sb >= lb.length && lb.length < la.length) {
    const rawAdd = la.slice(0, la.length - sb);
    const added = rawAdd
      .replace(/^[。；，、且并和及\s]+/, '')
      .replace(/[，,、]?(?:并且|并|且|同时|还)?[。；\s]*$/, '');
    /* 新增内容必须能独立成句：以运算符结尾（蒙犽「200+」）、只是修饰语
       （虞姬「己方」）、或只有状语没有谓语（「战斗中每分钟」）时退回箭头形式，
       否则会写成「…且200+（新增）」「恢复2点生命，且战斗中每分钟（新增）」 */
    const okAdd = added.length >= 2 && !/[+\-×/%=]$/.test(added) &&
      !/^(己方|敌方|我方|对方|自身|全体|所有|每个|任意|其他)$/.test(added) &&
      hasPred(added);
    if (okAdd) {
      const tail = b.replace(/[。；\s]+$/, '') + (/[。！？]$/.test(b) ? '。' : '');
      /* 新增的是一整句（多彩古币「获得1张古币。古币牌只能…」）：它排在原有效果
         之前，必须前置，接在原来的长句末尾会被读成最后一条的子项
         （「等级额外+7；新增：获得1张古币」） */
      if (/[。；]\s*$/.test(rawAdd)) return '【新增】' + added + '（新增）【/新增】；' + tail;
      /* 新增内容只是接在原句末尾（庄周「护盾量提升至700，且技能范围…」）：
         原有效果在前、新增在后，用「且」接住，一眼能看出只多了哪一句 */
      return tail.replace(/([。！？])$/, '') + '，且【新增】' + added + '（新增）【/新增】' +
        (/[。！？]$/.test(b) ? '。' : '');
    }
    /* 右支只是在左支数值前平添一个数（安琪拉「每0.1秒造成10%法术攻击力…」→
       「每0.1秒造成5+10%法术攻击力…」）：就地写成「10% → 5+10%」，
       别把整句两端都抄一遍 */
    if (/^[0-9]+(?:\.[0-9]+)?[+\-×\/]$/.test(rawAdd)) {
      const v = lb.match(/^[0-9]+(?:\.[0-9]+)?[%％]?/);
      if (v) return pre + v[0] + ' → ' + rawAdd + v[0] + lb.slice(v[0].length);
    }
    /* 只是给前面的名词补一个比例 / 限定（「其等级」→「其等级的70%」）：
       把被修饰的名词提到箭头两侧，读成「其等级 → 其等级的70%」 */
    const segN = /[\u4e00-\u9fa5]{2,8}$/.exec(pre);
    if (segN && /^的/.test(rawAdd)) {
      return pre + ' → ' + segN[0] + rawAdd + lb;
    }
  }
  /* 公共前缀切在了名词和它的修饰语之间（右支以「的」开头）：就地写会读成
     「其等级 → 的70%」这种残句，宁可整句两端全写 */
  if (/^的地得/.test(la)) return b + ' → ' + a;
  /* 后缀剥离后两侧紧邻后缀的词性必须一致：李元芳「1张精致古币 → 2张古币」里，
     调整前剥完只剩「1张精致」，量词和后面的名词被拆到箭头两边，读不出是什么 */
  const QCH = '张枚个名件点种位条回合层次';
  const nounTail = s => new RegExp('[0-9]+[' + QCH + '][\\u4e00-\\u9fa5]{1,2}$').test(s);
  const quantTail = s => new RegExp('[0-9]+[' + QCH + ']$').test(s);
  /* 后缀开头是单位（「%」「万钻石」「秒」）时不能剥：左边只剩「15」「5」这种裸数字 */
  const UNIT_HEAD = '%千万张枚个名件点种位条回合层次秒元钻倍级星分米格';
  /* 左边以形容词结尾时不能剥：「真实 → 法术伤害」会让人以为是从「真实」改成「法术」 */
  const ADJ_TAIL = /(真实|物理|法术|魔法|额外|普通|最大|基础|全部|原有|当前)$/;
  /* 试剥 n 个字符的公共后缀，任何一条守卫命中就放弃，交给箭头形式 */
  function tryStrip(n) {
    if (n < 2 || n >= lb.length || n >= la.length) return '';
    /* 公共后缀里带逗号时切在标点处，不要切进词中间：
       红莲炎甲「…和吸血效果，持续3秒」按最长后缀会剥成「吸血 → 护盾效果」，
       「效果」被拆到箭头两侧 */
    const full = lb.slice(lb.length - n);
    const pi = full.search(/[，,、]/);
    const cutComma = pi > 0 && pi < n - 1;
    if (cutComma) n -= pi;
    let l = lb.slice(0, lb.length - n), r = la.slice(0, la.length - n);
    let s = lb.slice(lb.length - n);
    /* 后缀被中间的逗号截短、两侧仍各带多个分句时，剥完会配错变化点
       （始祖熊灵「每攻击8次，…增加20% → 每攻击5次，…增加15%，…」），不剥 */
    if (cutComma && /[，,；;]/.test(l) && /[，,；;]/.test(r)) return '';
    /* 两版只差一个数（限制性进化「获得2张天赋牌【限制性进化】：…」→「获得3张…」）：
       把后缀开头的量词带进箭头两侧，写成「2张 → 3张」；否则左支只剩一个数字，
       会被当成「切在词中间」放弃，退回整句长箭头，右支还要把没变的尾巴抄一遍 */
    if (l.length < 2 || r.length < 2) {
      const shortNum = t => /^[0-9]+(?:\.[0-9]+)?%?$/.test(t);
      const um = s.match(/^[张枚个名件点种位条回合层次秒元钻倍级星分米格]+/);
      if (shortNum(l) && shortNum(r) && um)
        return pre + l + um[0] + ' → ' + ordPrefix + r + um[0] + s.slice(um[0].length);
      return '';
    }
    /* 剥完只剩单字时说明切在了词中间（红莲炎甲「吸 → 护效果」） */
    if (l.length < 2 || r.length < 2) return '';
    /* 两侧残段都只剩两三个汉字时，被剥掉的多半是它们共用的中心词：
       「吸血效果 → 护盾效果」会被剥成「吸血 → 护盾效果」，
       「近战英雄 → 远程英雄」会变成「近战 → 远程英雄」，读起来像换了词性 */
    const SHORT_CJK = /^[\u4e00-\u9fa5·]{2,3}$/;
    if (SHORT_CJK.test(l) && SHORT_CJK.test(r)) return '';
    /* 公共后缀可能从一个括号中间开始（「【河洛】英雄 → 【长安】英雄」会剥成
       「【河洛 → 【长安】英雄」）：括号被拆到箭头两侧就不剥 */
    const brDelta = t => {
      let d = 0;
      for (const ch of String(t)) {
        if (OPEN_BR.includes(ch)) d++;
        else if (CLOSE_BR.includes(ch)) d--;
      }
      return d;
    };
    if (brDelta(l) || brDelta(s)) return '';
    const tokenCut = TOKEN_RE.test(l[l.length - 1]) && TOKEN_RE.test(s[0]);
    /* 单位判断要看完整左文：西施「造成100点」的变化点在被保留的「造成100」里，
       只看剥离后的「点」会漏判，压成「100点 → 100+150%法术攻击力的」。
       「%」不算：它是数值自身的一部分（「17% → 10+20%」的左支是完整数值，
       不是被拆开的裸数字） */
    const unitCut = (/[0-9]$/.test(l) && UNIT_HEAD.includes(s[0])) ||
      new RegExp('[0-9][' + UNIT_HEAD.replace('%', '') + ']$').test(pre + l);
    /* 左侧以数字结尾、后缀以「的」开头时，被剥掉的「的+中心词」是数字修饰的对象
       （昭君「已觉醒英雄数量×1.5的等级 → ×2的等级」）：剥完左边只剩「×1.5」 */
    const deCut = /[0-9]$/.test(l) && s[0] === '的';
    const asym = (nounTail(l) && quantTail(r)) || (quantTail(l) && nounTail(r));
    /* 右支很长时再剥掉末尾几个字的公共部分，左支会停在半句上
       （王牌对决「…6名玩家确认 → …随机确认6人参赛」）：这种短尾不剥 */
    if (r.length > 18 && s.length <= 4) return '';
    /* 右侧以「的」结尾说明剥在了定语和中心词之间（西施「…法术攻击力的」）；
       左边以「】」结尾时它是后面名词的定语（虞姬「【大河流域】英雄 → 己方英雄」），
       把「英雄…」剥到后缀里会让左边只剩一个光秃秃的阵营名 */
    if (tokenCut || unitCut || deCut || asym || ADJ_TAIL.test(l) || /的$/.test(r) || /[】」》）)]$/.test(l)) return '';
    /* 剥完左支以连词收尾、右支却没有对应连词：并列列表的最后一项被剥到了箭头
       右边，左支读成「50%伤害减免和 →」（始祖熊灵
       「50%伤害减免和攻速 → 35%伤害减免和50%攻速」） */
    if (/(?:以及|和|与|及|、)$/.test(l) && !/(?:以及|和|与|及|、)$/.test(r)) return '';
    /* 左侧残段以逗号收尾时（班叔「比赛开始时，获得1张便携式机关」），这个逗号是
       它和公共后缀之间的停顿；后缀被剥到箭头右侧后，逗号也要跟着过去，
       否则读成「比赛开始时， → 开局及棋手5级时获得1张便携式机关」 */
    let midL = l, sepMoved = '';
    if (/[，,、]$/.test(l) && !/^[，,、。；：]/.test(s)) {
      midL = l.slice(0, -1);
      sepMoved = '，';
    }
    const mid = compressPair(midL, r);
    /* 公共后缀以连词开头时（西施「并眩晕周围的敌方单位2秒」），它同时修饰
       调整前后两版；紧跟右支会读成「只有调整后才有眩晕」，用逗号断开 */
    const tailSep = /^(?:并且|并|且|同时|还|以及|和|与|及|或)/.test(s) ? '，' : '';
    return pre + (ordPrefix && mid.indexOf(' → ') >= 0 ? mid.replace(' → ', ' → ' + ordPrefix) : mid) +
      (sepMoved || tailSep) + s;
  }
  let out = tryStrip(sb);
  if (!out && sb >= 2 && sb < lb.length) {
    /* 公共后缀里最后一个连接词之后才是真正变化的落点：
       西施「…法术伤害并眩晕…」只剥「并眩晕…」，前半句「法术伤害」留在变化里 */
    let ci = -1, m2;
    const cre = /(?:并且|并|且|同时|还)/g;
    while ((m2 = cre.exec(suf))) ci = m2.index;
    while (ci > 0 && /[，,、]/.test(suf[ci - 1])) ci--;
    if (ci > 0) out = tryStrip(suf.length - ci);
  }
  if (out) return out;
  /* 右支用阵营名（【…】）替换掉左支的名词、且右支没有数量词时，右支丢了
     「自身及随机2名不同」这类限定语，会读成「所有己方英雄」（虞姬）：
     把前缀最后一个标点后的限定语补到右支 */
  let rightPre = '';
  if (/^【[^】]{1,12}】/.test(lb) && !/[0-9一二三四五六七八九十]+[名个张枚位条]/.test(la)) {
    const pl = pre.split(/[，,。；、]/).pop() || '';
    if (pl.length >= 2 && !/[和与及或、，,]$/.test(pl) && !la.startsWith(pl)) rightPre = pl;
  }
  /* 右支省略了主语、只把共有的中心词抄了一遍：合并成「…60% → 75%」 */
  const omit = compressOmitted(lb, la);
  if (omit) return pre + omit;
  return pre + lb + ' → ' + ordPrefix + rightPre + la;
}

/* 原文一侧的行（去掉单独成行的「调整前/调整后」标签） */
function rawSideLines(arr) {
  return arr.map(s => String(s).trim())
    .filter(s => s && !/^调整[前后][：:]?$/.test(s));
}

/* 「调整前/调整后」两侧逐行都是完整句（以 。！？ 结尾）、行数也一一对应：
   原文就是按行列举，压缩后仍要一行一句，不能拼成一段 */
function isSentenceLines(rawBefore, rawAfter) {
  const full = arr => arr.length > 1 && arr.every(s => /[。！？]$/.test(s));
  return rawBefore.length === rawAfter.length && full(rawBefore) && full(rawAfter);
}

/* 前缀（「基础技能」「10级」）与变化正文拼接：
   前缀本身已带冒号时改用分号，避免出现「基础技能：…：…」 */
function composeDesc(prefixLines, before, after, opts) {
  /* 原文两侧逐行都是完整句、且一行对一行（觉醒前/后、10级/100级…）：
     逐行独立压缩，行与行之间保留换行，行末保留原句号，不能拼成一段 */
  const lineMode = !!(opts && opts.sentenceLines) &&
    before.length > 1 && before.length === after.length;
  let body;
  if (lineMode) body = before
    .map((b, i) => composeDesc([], [b], [after[i]]))
    .filter(Boolean).join('\n');
  const pairs = lineMode ? null : pairSides(before, after);
  if (pairs) {
    /* 触发条件常被逗号切成半句（「战斗开始时」「每有7级」），先和紧跟的效果合回一句：
       否则条件被保留、效果被当成未变项删掉，会剩下一句没头没尾的话 */
    /* 「每次造成伤害」这类是动作本身，不是触发条件，不能和后一句合并
       （米莱狄「仆从攻击每次造成…」会和「机械仆从到达最大数量后」粘成长箭头） */
    const COND_RE = /(触发|登场|施法|释放技能|施加|命中|受到|战斗开始时|回合开始时|每当|每有|每[0-9一二三四五六七八九十]+级|若|时$|后$|前$)/;
    const KEEP_SAME_RE = /(每次|额外|继承|叠加|翻倍)/;
    const units = [];
    for (let i = 0; i < pairs.length; i++) {
      let b = pairs[i][0], a = pairs[i][1], sep = pairs[i][2] || '';
      /* 「战斗开始时」「每有7级」这类条件常被逗号切成半句，和紧跟的效果合回一句。
         但原文用句号断开的两句不能合并，否则会把两条规则粘成一条 */
      /* 「触发」「命中」这类词也可能出现在完整句里（海诺「对命中的敌人造成…」），
         只有真正没有谓语的条件半句才往后并，否则会把整句和下一句粘成一条长箭头 */
      if (COND_RE.test(b) && !/[。！？；]/.test(b) && !/[。！？]/.test(sep) && i + 1 < pairs.length &&
          !hasPred(b) && b.length <= 16 &&
          !/^(觉醒[前后]|调整[前后])/.test(pairs[i + 1][0])) {
        b += '，' + pairs[i + 1][0];
        a += '，' + pairs[i + 1][1];
        sep = pairs[i + 1][2] || '';
        i++;
        /* 条件后面常还跟着未变的分句（米莱狄「…到达最大数量后，再次释放技能，
           增加仆从15%攻击速度」）：一直并到第一个真正变化的分句，否则条件被单独
           留在箭头左边，右边成了没头没尾的残句 */
        while (i + 1 < pairs.length && pairs[i][0] === pairs[i][1] &&
               !/[。！？]/.test(pairs[i][2] || '') &&
               !/^(觉醒[前后]|调整[前后])/.test(pairs[i + 1][0]) &&
               /* 下一句是「10级：」「100级：」这种档位标签时，它已经是另一段内容
                  （蒙犽「…衰减40%。10级：导弹伤害…」），不能并进同一个箭头 */
               !/^[0-9一二三四五六七八九十百]+级/.test(pairs[i + 1][0]) &&
               !/^[^，,。；]{1,8}[：:]/.test(pairs[i + 1][0])) {
          b += '，' + pairs[i + 1][0];
          a += '，' + pairs[i + 1][1];
          sep = pairs[i + 1][2] || '';
          i++;
        }
      }
      units.push([b, a, sep]);
    }
    let rows = units.map(([b, a, sep]) => {
      const same = b === a;
      return { txt: compressPair(b, a), same, keep: same && (COND_RE.test(b) || KEEP_SAME_RE.test(b)), sep };
    });
    /* 首个变化句与最后一个变化句之间的未变分句必须保留：
       夹在两个箭头中间的「并朝目标敌人附近2名敌人掷出子杖」是后一个箭头的
       主语，删掉后「造成50+100% → 100+150%」就成了没头没尾的残句（海诺） */
    let firstCh = -1, lastCh = -1;
    rows.forEach((r, i) => {
      if (!r.same || r.keep) { if (firstCh < 0) firstCh = i; lastCh = i; }
    });
    const kept = rows.filter((r, i) => !r.same || r.keep || (i > firstCh && i < lastCh));
    if (kept.length) {
      /* 前面未变的半句被删掉后，紧随其后的「并/且/同时」会变成没有主语的残句
         （马超「被动：并提升5点…」）。但下面要把前文补回来时，这个连词正是
         连接前后两句所必需的，先记下来，补前文时再放回去
         （「…恢复自身100+75%物理攻击力的生命值，并提升5点物理攻击力 → 10点物理攻击力」） */
      let leadConj = '';
      if (kept[0] !== rows[0]) {
        const cm = kept[0].txt.match(/^(?:并|且|同时|还|以及|和|及|再)[，,]?/);
        if (cm) {
          leadConj = cm[0].replace(/[，,]$/, '');
          kept[0].txt = kept[0].txt.slice(cm[0].length);
        }
      }
      /* 被删掉的未变分句常带着主语/触发条件（红莲炎甲「唯一。每2秒对周围…造成
         伤害，并降低目标…」）：首个变化句以动词开头时读不出主语，把前面的
         上下文并回来；以「此英雄」「该单位」这类指代开头的句子同样需要前文，
         否则读者不知道「此」指的是谁（好聚好散「指定移除一名英雄，获得能量。
         此英雄0/1/2/3觉醒进度时…」） */
      if (kept[0] !== rows[0] &&
          /^(?:降低|提高|提升|增加|减少|移除|删除|获得|造成|恢复|回复|使|令|对|为|将|额外|此|该|其|这|那)/.test(kept[0].txt)) {
        const leadIdx = rows.indexOf(kept[0]);
        const leadRows = rows.slice(0, leadIdx).map(r => r.txt).filter(Boolean);
        if (leadRows.length) {
          let lead = leadRows[0];
          for (let k = 1; k < leadRows.length; k++) {
            /* 「唯一」这类短标签单独成句，长分句用逗号接续 */
            lead += (leadRows[k - 1].length <= 4 ? '。' : '，') + leadRows[k];
          }
          kept[0].txt = lead + (lead.length <= 4 ? '。' : (/^(?:此|该|其|这|那)/.test(kept[0].txt) ? '。' : '，' + leadConj)) + kept[0].txt;
        }
      }
      /* 只改了时间/数值的分句本身没有动作（明先生「第6/10回合 → 第6/11回合」），
         紧随其后的未变分句才是这条调整的效果（「获得1张秘技牌【命运馈赠】」）：
         一起删掉会只剩一个光秃秃的回合数，读者不知道改了什么。
         箭头后面未变的补充句照原文保留，与它有没有谓语无关 */
      const tailRow = kept[kept.length - 1];
      const tailIdx = rows.indexOf(tailRow);
      const tailSame = rows.slice(tailIdx + 1).filter(r => r.same && r.txt);
      if (tailSame.length) {
        let t = tailRow.txt;
        let prevSep = tailRow.sep;
        tailSame.forEach(r => {
          if (!/[。！？；]$/.test(t)) {
            t += /[。！？]/.test(prevSep) ? '。' : (/[；;]/.test(prevSep) ? '；' : '，');
          }
          t += r.txt;
          prevSep = r.sep;
        });
        tailRow.txt = t;
        tailRow.sep = tailSame[tailSame.length - 1].sep;
      }
      rows = kept;
    }
    body = rows.map((r, k) => {
      if (!k) return r.txt;
      /* 「持续3秒」「期间…」是对上一句效果时长的补充，用分号会读成另一条规则
         （米莱狄「增加仆从攻击速度 → 60%；持续5秒」） */
      const prev = rows[k - 1];
      let sep;
      if (/^(?:持续|期间|随后|之后|并|且|同时|还)/.test(r.txt)) sep = '，';
      /* 其余分句沿用原文的断开标点：原文用「。」的两句仍用「。」，
         不能一律改成「；」，否则卡片标点和公告原文对不上 */
      else if (/[。！？]$/.test(prev.txt)) sep = '';
      else sep = prev.sep || '；';
      return sep + r.txt;
    }).join('');
  } else if (!lineMode) {
    /* 句数对不齐时不再整段硬拼，先压掉公共前后缀，至少去掉重复内容 */
    body = compressPair(before.join('；'), after.join('；'));
  }
  const pfxEnd = /[。！？]\s*$/.test(prefixLines[prefixLines.length - 1] || '');
  /* 前缀行之间用「；」连接，但上一行已经自带收尾标点（句号、分号、冒号…）时
     不再补分号，否则会出现「…可正常触发。；数值调整：…」、
     「…内容迭代：；1.…」「…下调至2张；；」这类重复标点 */
  const pfx = prefixLines.reduce((all, s, i) => {
    if (!i) return s;
    const prev = String(prefixLines[i - 1]);
    /* 上一行以冒号收尾是在引出下面的列举：直接换行，不能粘成「内容迭代：1.…」 */
    if (/[：:]\s*$/.test(prev)) return all + '\n' + s;
    return all + (/[。！？；;，,、]\s*$/.test(prev) ? '' : '；') + s;
  }, '').replace(/[；;。\s]+$/, '').trim();
  /* 正文末尾的冒号/分号是悬空的（「…如下：」后面没有内容），去掉再补句号 */
  body = body.replace(/[：:；;]\s*$/, '');
  if (!body) return pfx ? pfx.replace(/[：:]\s*$/, '') + '。' : '';
  const end = /[。！？]$/.test(body) ? '' : '。';
  if (!pfx) return body + end;
  /* 前缀已经概括了正文第一条新增（多彩古币「增加保底获得1张古币的设定。」
    与新增句「获得1张古币」）：同一件事不说两遍，把（新增）标到概括句上，
    正文只留后面的细则 */
  const dupM = /^【新增】([^【】]*?)（新增）【\/新增】[；;。]?/.exec(body);
  if (pfxEnd && dupM && dupM[1] && pfx.indexOf(dupM[1]) >= 0) {
    const rest = body.slice(dupM[0].length);
    const pfxNew = '【新增】' + pfx + '（新增）【/新增】';
    if (!rest) return pfxNew + '。';
    return pfxNew + (/[：:]$/.test(pfx) ? '' : '：') + rest + end;
  }
  /* 前缀本身是一句完整的话（吕布「基础技能：略微延长了吕布技能释放时间。」）：
     下一句另起，不能再用冒号把两句话粘成一句 */
  if (pfxEnd) return pfx + '。' + body + end;
  /* 前缀以逗号收尾时直接接正文，别再补冒号（「…复生的英雄，：获得…」） */
  if (/[，,、]$/.test(pfx)) return pfx + body + end;
  if (/[：:]$/.test(pfx)) return pfx + body + end;
  /* 前缀自身带冒号但没在末尾收住（明先生「秘技任务：天降鸿运」）：冒号后的
     短词是这条调整的所属对象，用分号会读成两个并列动作 */
  const pfxTail = pfx.split(/[：:]/).pop() || '';
  return pfx + (/[：:]/.test(pfx) && pfxTail.length <= 12 ? '，' : '：') + body + end;
}

/* 调整前/调整后各有多行、且每行都是「对象：内容」时，这是机制/规则改写，
   不是单个数值替换（王牌对决「万象大赛：旧选人方式 → 新选人方式」）。
   按对象各占一行写「对象：调整前：…；调整后：…」，不要压成箭头 */
const LABEL_SKIP_RE = /^(?:觉醒[前后]|调整[前后]|新增|[0-9一二三四五六七八九十百]+级|基础技能|技能|被动|主动|奥义|绝技|战斗开始|回合开始|第[0-9一二三四五六七八九十]+回合)$/;
function composeLabeled(prefixLines, before, after) {
  if (before.length < 2 || before.length !== after.length) return '';
  const rows = [];
  for (let i = 0; i < before.length; i++) {
    const mb = /^([^，,。；：:]{1,12})[：:]\s*(.+)$/.exec(before[i]);
    const ma = /^([^，,。；：:]{1,12})[：:]\s*(.+)$/.exec(after[i]);
    if (!mb || !ma || mb[1] !== ma[1] || LABEL_SKIP_RE.test(mb[1])) return '';
    const b = stripAdjust(mb[2]), a = stripAdjust(ma[2]);
    if (!b || !a) return '';
    /* 只处理整句改写。纯数值档位（排位分「第一名：+60（…）」）压成
       「调整前/调整后」会啰嗦成六行，仍交给箭头 */
    const plainClause = t => t.trim().length >= 8 && !/^[+\-−]?[0-9]/.test(t.trim());
    if (!plainClause(b) || !plainClause(a)) return '';
    rows.push(mb[1] + '：调整前：' + b + '；调整后：' + a + '。');
  }
  const pfx = prefixLines.map(s => String(s).trim()).filter(Boolean)
    .reduce((all, s, i, arr) => !i ? s : all + (/[。！？；;：:，,、]\s*$/.test(arr[i - 1]) ? '' : '；') + s, '')
    .replace(/[；;。\s]+$/, '');
  return (pfx ? pfx + (/[：:]$/.test(pfx) ? '\n' : '：\n') : '') + rows.join('\n');
}

/* 第一章长句是否就地标箭头（勾选＝精简；取消＝整句两端全写）。
   两种写法都在「调整前/调整后」原文基础上生成，随时可切 */
let inlineMode = true;

/* 长句只改了几处数值时，整句只写一遍，变化点就地写成「旧 → 新」，
   避免「整句 → 整句」的整段重复（蒙犽「发射8枚… → 发射12枚…」）。
   不适合就地改写时返回空串，调用方退回两端全写：
   · 太短：短数值对本来就是「8 → 12」最清楚
   · 句中出现纯插入/纯删除：夹在句子里补一段或删一段，就地改写会读成残句
   · 变化点超过 3 处、或改动量超过四成：那其实是整句重写
   句尾追加新内容（多一句说明、补个括号）不算残句：接在原句后面标成【新增】即可 */
function inlineDiff(bb, aa) {
  if (Math.min(bb.length, aa.length) < 16) return '';
  /* 数字（含小数、百分比、用「/」「、」串起来的数组）整块当一个 token：
     「100%」不能拆成「1」「0」「0%」，「3/5/7/9」也不能拆成四个数——
     拆开会让箭头切在数字中间，或变化点太多被误判成整句重写。
     「第」也带进 token，这样「第6/10 → 第6/11」不会丢右边的「第6/」 */
  const tok = s => s.match(/第?[0-9]+(?:\.[0-9]+)?[%％]?(?:[\/／、][0-9]+(?:\.[0-9]+)?[%％]?)*|[\s\S]/g) || [];
  const A = tok(bb), B = tok(aa);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ eq: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ del: A[i] }); i++; }
    else { ops.push({ ins: B[j] }); j++; }
  }
  while (i < n) ops.push({ del: A[i++] });
  while (j < m) ops.push({ ins: B[j++] });
  /* 合并成「相同段 / 变化段」 */
  const blocks = [];
  let eq = '', ch = null;
  ops.forEach(o => {
    if (o.eq !== undefined) {
      if (ch) { blocks.push(ch); ch = null; }
      eq += o.eq;
      return;
    }
    if (!ch) {
      if (eq) { blocks.push({ eq }); eq = ''; }
      ch = { del: '', ins: '' };
    }
    if (o.del !== undefined) ch.del += o.del; else ch.ins += o.ins;
  });
  if (ch) blocks.push(ch);
  if (eq) blocks.push({ eq });
  /* 变化段两侧各带一个并列连词（「并无敌」→「和70%伤害减免」）：右侧那个连着
     被换掉的那一项，没有并列对象，就地写出来会多一个「和」 */
  blocks.forEach(x => {
    if (x.del === undefined) return;
    if (/^(?:并且|并|且|同时|还|以及|和|与|及|或)/.test(x.del))
      x.ins = stripLeadConj(x.del, x.ins);
  });
  /* 「70+120% → 100+130%」这种成对数值：两个变化点之间只隔一个符号（+ / ×），
     分开标会读成「70 → 100+120% → 130%」，把中间那段并进同一个箭头 */
  for (let k = 1; k < blocks.length - 1; k++) {
    const a1 = blocks[k - 1], gap = blocks[k], a2 = blocks[k + 1];
    if (a1.del === undefined || a2.del === undefined || gap.eq === undefined) continue;
    if (gap.eq.length > 2 || /[\u4e00-\u9fa5A-Za-z0-9]/.test(gap.eq)) continue;
    a1.del += gap.eq + a2.del;
    a1.ins += gap.eq + a2.ins;
    blocks.splice(k, 2);
    k -= 2;
  }
  const chs = blocks.filter(x => x.del !== undefined);
  if (!chs.length || chs.length > 3) return '';
  /* 句尾追加的新内容（「（不可叠加）」、多补的一句说明）：接在原句后面标成新增，
     不用把整句写两遍。中间的纯插入仍放弃——夹在句子里补一段，就地写会读成残句 */
  const tailIns = new Set();
  blocks.forEach((x, k) => {
    if (x.del === undefined || x.del || !x.ins) return;
    if (blocks.slice(k + 1).every(y => y.eq !== undefined && !String(y.eq).trim())) tailIns.add(x);
  });
  if (chs.some(x => (!x.del || !x.ins) && !tailIns.has(x))) return '';
  /* 变化点后面紧跟「+100%」这类同一数值表达式的后半段
     （孙尚香「造成50+100% → 100+100%」）：不并进来会读成「50 → 100+100%」，
     旧值少了半截，右边也被当成新加的数 */
  for (let k = 0; k < blocks.length - 1; k++) {
    const ch = blocks[k], nx = blocks[k + 1];
    if (ch.del === undefined || nx.eq === undefined) continue;
    if (!/[0-9%％]$/.test(ch.del) || !/[0-9%％]$/.test(ch.ins)) continue;
    const m2 = /^[+×\*][0-9]+(?:\.[0-9]+)?[%％]?/.exec(nx.eq);
    if (!m2) continue;
    ch.del += m2[0];
    ch.ins += m2[0];
    nx.eq = nx.eq.slice(m2[0].length);
  }
  /* 纯文字替换（「吸血 → 护盾」「真实 → 法术」）也能就地写，但要求两边等长：
     长度差太多时 LCS 会把共用的词留在箭头外，读成「最大 → 基础生命值」
     （护盾那条），只能退回两端全写 */
  const badText = blocks.some(x => {
    if (x.del === undefined || tailIns.has(x)) return false;
    if (/[0-9]/.test(x.del) && /[0-9]/.test(x.ins)) return false;
    /* 短的一侧是纯文字、另一侧带着数值（暴君「无敌 → 和70%伤害减免」）：
       这是把一条效果换成另一条，就地写读得通，共用前缀不会被卷进箭头 */
    if (/[0-9]/.test(x.del + x.ins) && Math.min(x.del.length, x.ins.length) <= 3) return false;
    return !(x.del.length === x.ins.length && x.del.length >= 2);
  });
  if (badText) return '';
  /* 换掉的是【大河流域】这类带方括号的整词：就地写会切成
     「【大河流域】 → 己方英雄」，读不通，宁可退回两端全写 */
  if (chs.some(x => !tailIns.has(x) && (/[【】]/.test(x.del) || /[【】]/.test(x.ins)))) return '';
  const amount = chs.reduce((s, x) => s + (tailIns.has(x) ? 0 : x.del.length + x.ins.length), 0);
  if (amount > (bb.length + aa.length) * 0.4) return '';
  let out = '';
  blocks.forEach((blk, k) => {
    if (blk.eq !== undefined) { out += blk.eq; return; }
    /* 句尾追加的新内容：接在整句后面标成新增，不参与箭头。
       追加内容自带的句首标点/连词留在新增区间外面（「持续5秒。【新增】（不可叠加）…」
       「获得20点法术攻击力且【新增】临时等级+1（新增）【/新增】」） */
    if (tailIns.has(blk)) {
      const txt = blk.ins.trim();
      const lead = (txt.match(/^(?:[。！？；，,]+|(?:并且|并|且|同时|还|以及|和|与|及|再)[，,]?)/) || [''])[0];
      out += lead + '【新增】' + txt.slice(lead.length).replace(/[。！？]$/, '') + '（新增）【/新增】';
      return;
    }
    /* 变化点前面是「30+」这种数值前缀时，把前缀带进箭头两侧，读成
       「30+150% → 30+80%」，不从半个数字开始切 */
    let pre = '';
    if (k > 0 && blocks[k - 1].eq !== undefined) {
      const m2 = /([0-9]+(?:\.[0-9]+)?\+)$/.exec(blocks[k - 1].eq);
      if (m2 && /^[0-9]/.test(blk.del) && /^[0-9]/.test(blk.ins)) pre = m2[1];
    }
    if (pre) {
      blocks[k - 1].eq = blocks[k - 1].eq.slice(0, -pre.length);
      out = out.slice(0, -pre.length) + pre + blk.del + ' → ' + pre + blk.ins;
    } else {
      out += blk.del + ' → ' + blk.ins;
    }
  });
  return out;
}

/* 全原文模式（第一章）：两侧各自照抄，只用箭头连起来。
   只做三件事：去掉「调整前/后：」、把两侧相同的短标签（觉醒前：/10级：）
   提到箭头前面、把行尾「新增：…」单独标成（新增）。
   任何删减、改写、合并都不做，保证和原文一字不差 */
function arrowVerbatim(prefixLines, before, after) {
  const tidy = s => String(s || '').trim()
    .replace(/^调整[前后][：:]?\s*/, '')
    .replace(/[；;。\s]+$/, '');
  const extras = [], afterMain = [];
  after.forEach(l => {
    const t = String(l).trim();
    if (/^新增[：:]/.test(t)) extras.push(t.replace(/^新增[：:]\s*/, ''));
    else afterMain.push(t);
  });
  const bs = before.map(tidy).filter(Boolean);
  const as = afterMain.map(tidy).filter(Boolean);
  const pfx = prefixLines.map(s => String(s).trim()).filter(Boolean)
    .map(s => s.replace(/[：:]\s*$/, '')).join('\n');
  /* 导语本身已经带句号/逗号时不要再补冒号（否则出现「…数值。：」「…英雄，：」） */
  const head = pfx ? (/[。！？；：，、]$/.test(pfx) ? pfx : pfx + '：') : '';
  const newTail = extras.filter(Boolean)
    .map(s => '【新增】' + s.replace(/[。！？]$/, '') + '（新增）【/新增】。');
  /* 两侧同一行：只把两边完全相同的短标签提到箭头前 */
  const pair = (b, a) => {
    let bb = b, aa = a, tag = '';
    const mb = /^([^：:，。；]{1,8})[：:]\s*/.exec(bb);
    const ma = /^([^：:，。；]{1,8})[：:]\s*/.exec(aa);
    if (mb && ma && mb[1] === ma[1]) {
      tag = mb[1] + '：';
      bb = bb.slice(mb[0].length);
      aa = aa.slice(ma[0].length);
    }
    /* 长句只改了几处数值：整句写一遍、变化点就地标箭头；
       就地改不动（整段插入、调序）时交给压缩算法按句对齐，
       再不行才退回两端全写。
       就地改写的行用不可见字符包起来，标【改】时按「箭头旁就是新值」处理 */
    const inl = (inlineMode && bb !== aa) ? inlineDiff(bb, aa) : '';
    let body;
    if (bb === aa) body = bb;
    else if (inl) body = '\uE000' + inl + '\uE001';
    /* 压缩算法不一定带箭头：整段追加时它写成「原句。【新增】追加句（新增）【/新增】」 */
    else body = inlineMode ? compressPair(bb, aa) : bb + ' → ' + aa;
    return tag + body + (/[。！？]$/.test(body.replace(/[\uE000\uE001]/g, '')) ? '' : '。');
  };
  let main = '';
  if (bs.length && as.length && bs.length === as.length) {
    main = bs.map((b, k) => pair(b, as[k])).join('\n');
  } else if (bs.length && as.length) {
    const b = bs.join('；'), a = as.join('；');
    main = (b === a ? b : b + ' → ' + a) + '。';
  } else {
    const one = bs.join('；') || as.join('；');
    main = one ? one + (/[。！？]$/.test(one) ? '' : '。') : '';
  }
  return head + main + (newTail.length ? (main ? '\n' : '') + newTail.join('\n') : '');
}

/* 原文自己写着「（新增）」的（第一章全原文照抄，不会再生成标记），
   从这一行起整段染成新增色（含随后的说明行），保证和压缩出来的新增标注一致。
   遇到编号小标题或新的「【…】」标签行就结束，不把后一段也染上 */
function markLiteralNew(s) {
  const lines = String(s).replace(/【\/?新增】/g, '').split('\n');
  const out = [];
  let start = -1;
  const close = () => {
    if (start < 0) return;
    for (let i = out.length - 1; i >= start; i--) {
      if (!out[i].trim()) continue;
      out[i] = /[。！？]\s*$/.test(out[i])
        ? out[i].replace(/([。！？])\s*$/, '【/新增】$1')
        : out[i] + '【/新增】';
      break;
    }
    start = -1;
  };
  lines.forEach(line => {
    const t = line.trim();
    if (start >= 0 && t && (/^[0-9]{1,2}[.、．]/.test(t) || /^【/.test(t))) close();
    if (start < 0 && /[（(]新增[）)]/.test(t)) {
      start = out.length;
      out.push('【新增】' + line);
      return;
    }
    out.push(line);
  });
  close();
  return out.join('\n');
}

/* 「处决标记（新增）」被提成标题后，名字行离开正文，正文会丢掉新增标记：
   这里把剩下的说明补成新增区间，保证出图还是金色（末尾按惯例带「（新增）」） */
function wrapNewBody(s) {
  if (!s) return s;
  if (/【新增】/.test(s)) return s;
  const m = /([。！？])$/.exec(s);
  const core = m ? s.slice(0, -1) : s;
  return '【新增】' + core + '（新增）【/新增】' + (m ? m[1] : '');
}

