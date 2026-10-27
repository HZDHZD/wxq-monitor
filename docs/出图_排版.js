/* 本文件由 出图.html 拆出，按函数名定位（行号会漂移） */
/* =======================  通用流式排版内核（新增风格共用）  ======================= */
/* 约定：pad 为页面外边距，固定不随字号缩放；其余所有尺寸比例均 × m × s */
function theme(o) {
  return Object.assign({
    /* 顶栏 */
    banPad: 0.045, banR: 0.032, tS: 0.080, tWeight: 800, tLhF: 1.18, titleRightPad: 0,
    subS: 0.050, subWeight: 800, subLhF: 1.30,
    banFill: '#ffffff', banStroke: null, banStrokeW: 0.006, banShadow: null,
    titleColor: '#111111', subColor: '#666666', titleGlow: null, titleGlowBlur: 0.030,
    banCenter: false,                                     /* 顶栏标题居中 */
    titleGradient: null,                                  /* 主标题渐变：[起始色, 结束色] */
    subPill: null,                                        /* 副标题胶囊底：{ fill:[色1,色2], padX } */
    /* 主体卡 */
    bodyR: 0.032, bodyPad: 0.042, bodyFill: '#ffffff', bodyStroke: null, bodyStrokeW: 0.004, bodyShadow: null,
    /* 章节条 */
    secBarH: 0.066, secS: 0.042, secR: 0.014, secGapT: 0.032, secPadL: 0.026,
    secFill: null, secText: '#222222', secAccent: null, secRule: null,
    /* 分组条 */
    grpS: 0.040, grpH: 0.058, grpR: 0.012, grpGapT: 0.024, grpGapB: 0.014, grpPadL: 0.026,
    grpFill: null, grpStroke: null, grpStrokeW: 0.0025, grpText: '#111111',
    /* 条目 */
    itS: 0.035, itLhF: 1.55, itPad: 0.028, itRight: 1, itR: 0.016, itGap: 0.016, card: true,
    itImg: false, avatars: null, itThumb: 0.30,
    itNameS: 0.054, itNameBar: '#f6b23c', itNameColor: '#ffffff', itNameScrim: 0.84,
    itFill: '#ffffff', itStroke: null, itStrokeW: 0.0022, itShadow: null,
    itTitle: '#111111', itDesc: '#555555', itNew: '#c8801a', itBullet: null, itRule: null,
    /* 数值变化（【改】标记）：统一金色 + 浅金底 */
    itVal: '#b07800', itValBg: '#f8e7bb',
    /* 署名 */
    footS: 0.032, footColor: '#888888'
  }, o || {});
}

/* 字形墨迹中心相对排版中心的偏移：让任意文字（含标点/符号）看起来都真正居中 */
function inkShift(ctx, text) {
  const mt = ctx.measureText(text);
  const aL = mt.actualBoundingBoxLeft, aR = mt.actualBoundingBoxRight;
  if (!isFinite(aL) || !isFinite(aR)) return 0;
  return (aL - aR) / 2;
}

/* 「新增：弈星 · 驭势」→「弈星 · 驭势」：只剥标记前缀，不动技能名 */
function stripItemPrefix(s) {
  return stripMarks(String(s || ''))
    .replace(/^\s*(?:【?(?:新增|调整|移除|删除|更名|改名|加强|削弱)】?[：:]\s*|【(?:新增|调整|移除|删除)】\s*)/, '');
}

/* 标题是否标为新增（「新增：xxx」或整条被成对标记包住） */
function isNewTitle(t) {
  return /^\s*(?:新增[：:]|【新增】)/.test(String(t || ''));
}

/* 从条目标题取棋手名（「庄小鱼 · 梦幻引擎」→「庄小鱼」） */
function heroName(title) {
  return stripItemPrefix(String(title || '').split(/[·・|｜\-—–\s]/)[0]).trim();
}

/* 命中头像库才返回 */
function portraitKey(title, avatars) {
  if (!avatars) return null;
  /* 拆页续卡标题带「（续）」：查图时先去掉，续页也能命中同一张立绘 */
  const n = heroName(String(title || '').replace(/[（(]\s*续\s*[)）]\s*$/, ''));
  return (n && avatars[n]) ? n : null;
}

function paintFlow(ctx, cfg, scale, oy, T) {
  const { W, H, title, sub, foot, sections, reserveT, reserveR, reserveB } = cfg;
  const m = Math.min(W, H);
  const s = scale;
  const o = oy || 0;
  const pad = Math.round(m * 0.075);                        /* 左右外边距，固定不随字号缩放 */
  const topY = pad + Math.round(H * (reserveT || 0));        /* 内容起始下移，避开顶部导航 */
  const cw = W - pad * 2;                                   /* 卡片满版左右对称，避让交给内容缩进 */
  const safeR = Math.round(W * (reserveR || 0));            /* 右侧互动按钮列宽度 */
  const noTitle = !!cfg.noTitle;                            /* 第 2 张起不再画标题 */

  if (T.bg) T.bg(ctx, W, H, m);

  ctx.save();
  ctx.translate(0, o);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  /* 顶栏不跟着正文无限放大：正文被自动放大到 150% 以上时（每套凑三页会把字号往上抬），
     顶栏继续同倍放大只会把标题/副标题挤成多行，固定停在 150% */
  const bs      = Math.min(s, 1.5);
  const banPad  = m * T.banPad * bs;
  const banR    = m * T.banR * s;
  /* 标题不过度随正文缩放：正文挤到很小时标题仍保持体量感 */
  let tS        = m * T.tS * (0.55 + 0.45 * s);
  let subS      = m * T.subS * bs;
  const bodyR   = m * T.bodyR * s;
  const bodyPad = m * T.bodyPad * s;
  const secBarH = m * T.secBarH * s;
  const secS    = m * T.secS * s;
  const secR    = m * T.secR * s;
  const secGapT = m * T.secGapT * s;
  const secPadL = m * T.secPadL * s;
  const grpS    = m * T.grpS * s;
  const grpH    = m * T.grpH * s;
  const grpR    = m * T.grpR * s;
  const grpGapT = m * T.grpGapT * s;
  const grpGapB = m * T.grpGapB * s;
  const grpPadL = m * T.grpPadL * s;
  /* 章节条 / 分组胶囊的标题太长时折成多行，行高与单行一致，上下留白保持原样 */
  const secLh = secS * 1.30;
  const grpLh = grpS * 1.30;
  const barH = (baseH, lh, n) => (n <= 1 ? baseH
    : lh * n + Math.max(0, (baseH - lh) / 2) * 2);
  const itS     = m * T.itS * s;
  const itLh    = itS * T.itLhF;
  const itPad   = m * T.itPad * s;
  /* 无标题条目（如问题修复）上下留白收窄，避免一张卡只放一行还占很高 */
  const itemPadY = (it) => String((it && it.t) || '').trim() ? itPad : itPad * 0.62;
  const itPadR = Math.max(0, (W - pad - bodyPad - safeR) - itPad - W * T.itRight);
  /* 条目文字右边界固定落在画面宽度 T.itRight 处（与内容无关），右侧全部留白 */
  const itR     = m * T.itR * s;
  const itGap   = m * T.itGap * s;
  const itIndent= (!T.card && T.itBullet) ? m * 0.028 * s : 0;
  const footS   = m * T.footS * s;
  /* 内容页底部一行：标语 + 互动引导，字号跟正文一致，居中；署名在卡片右下方橙色区 */
  const ctaText    = String(cfg.cta || '').trim();
  const sloganText = String(cfg.slogan || '').trim();
  const tipText    = [sloganText, ctaText].filter(Boolean).join('｜');
  const tipRes     = tipText ? (itS + m * 0.032 * s) : 0;

  const innerW = cw - bodyPad * 2 - safeR;                   /* 内容缩进，避开右侧互动按钮列 */
  const cols = (W > H * 1.15) ? 2 : 1;
  const colGap = m * 0.030 * s;
  const colW = (innerW - colGap * (cols - 1)) / cols;

  /* --- 顶栏测量 --- */
  const titleW = cw - banPad * 2 - safeR - m * T.titleRightPad * s;
  const pillPadX = T.subPill ? m * T.subPill.padX * bs : 0;
  /* 正文放大后顶栏不许换行破版：标题/副标题宽了只把顶栏字号收回来。
     收字下限按 100% 字号算（不跟着正文倍数抬高），否则正文放大到 150% 时
     下限也跟着涨，副标题收不回一行，会被拆成好几个胶囊 */
  const fitBarText = (str, size, weight, maxW, minS) => {
    const txt = String(str || '').trim();
    if (!txt) return size;
    setFont(ctx, size, weight);
    const w = ctx.measureText(txt).width;
    if (w <= maxW) return size;
    return Math.max(minS, Math.floor(size * maxW / w));
  };
  if (!noTitle) {
    tS = fitBarText(title, tS, T.tWeight, titleW, Math.round(m * T.tS * 0.6));
    if (sub) subS = fitBarText(sub, subS, T.subWeight, titleW - pillPadX * 2, Math.round(m * T.subS * 0.6));
  }
  const tLh     = tS * T.tLhF;
  const subLh   = subS * T.subLhF;
  /* 胶囊高度按整行留足：中文字面几乎占满字号，按 0.84 行高会把上下留白压到 3px */
  const pillH = T.subPill ? subLh * 0.98 : 0;
  setFont(ctx, tS, T.tWeight);
  const tLines = wrapText(ctx, title, titleW);
  setFont(ctx, subS, T.subWeight);
  const sLines = sub ? wrapText(ctx, sub, titleW - pillPadX * 2) : [];
  const banTextH = tLines.length * tLh + (sLines.length ? m * 0.016 * bs + sLines.length * subLh : 0);
  const banH = noTitle ? 0 : banTextH + banPad * 2;
  const gapBanBody = noTitle ? 0 : m * 0.042 * bs;

  /* --- 正文分块 --- */
  const left = pad + bodyPad;
  const tw0 = colW - itPad * 2 - itIndent - itPadR;
  /* 立绘卡与其他条目同宽（满宽），只有文字仍在 T.itRight 安全线前断行 */
  const gridW = colW;
  const lineR = W * T.itRight;
  /* 章节条 / 分组胶囊的文字宽度上限：不进右侧遮挡区，也不越过 T.itRight 断行线 */
  const barTextW = (padX) => Math.max(m * 0.06 * s, Math.min(innerW, lineR - left) - padX * 2);
  /* 单列横卡的缩略图宽度与字号同比例，保证不同字号下图文比例一致 */
  const thumbW = (w) => Math.round(w * (T.itThumb || 0.26) * s);
  const imgNameS = m * T.itNameS * s;
  const imgSkillS = itS * 1.04;
  const useImg = !!T.itImg && !!T.avatars;

  /* 「庄小鱼 · 梦幻引擎」→ { name:'庄小鱼', skill:'梦幻引擎' } */
  const splitItem = (t) => {
    const str = stripItemPrefix(t);
    const p = str.split(/[·・|｜\-—–]/);
    if (p.length > 1) {
      const name = p[0].trim(), skill = p.slice(1).join('·').trim();
      if (name && skill) return { name, skill };
    }
    return { name: '', skill: str };
  };

  /* 棋手 → 技能子条目：技能名单独一行加粗，说明另起一行。
     一个棋手可以挂多个技能，逐个往下排，父卡整体不拆页 */
  const kidsOf = (it) => (Array.isArray(it && it.kids) ? it.kids : [])
    .map(k => ({ t: String((k && k.t) || '').trim(), d: String((k && k.d) || '').trim() }))
    .filter(k => k.t || k.d);
  const kidS = itS * 0.92;
  const kidLineH = itLh;
  const kidGapY = Math.round(itS * 0.40);
  const kidTagGap = Math.round(itS * 0.30);

  const measureKid = (k, w) => {
    const name = k.t, body = splitAwaken(k.d);
    setFont(ctx, kidS, 700);
    /* 技能名太长时截断，不越过卡片右边界 */
    let label = name;
    if (label) {
      const maxTW = Math.max(kidS * 4, w);
      if (ctx.measureText(label).width > maxTW) {
        while (label.length > 1 && ctx.measureText(label + '…').width > maxTW) label = label.slice(0, -1);
        label += '…';
      }
    }
    setFont(ctx, itS, 400);
    const kdl = body ? wrapText(ctx, body, w) : [];
    let h = 0;
    if (label) h += kidLineH;
    if (kdl.length) h += (label ? kidTagGap : 0) + kdl.length * itLh;
    return { kt: label, kd: body, kdl, dInd: 0, h };
  };
  const measureKids = (it, w) => kidsOf(it).map(k => measureKid(k, w));
  const kidsBlockH = (kms) => kms.reduce((a, km, i) => a + km.h + (i < kms.length - 1 ? kidGapY : 0), 0);

  const drawKid = (km, x, y) => {
    let yy = y;
    if (km.kt) {
      setFont(ctx, kidS, 700);
      ctx.fillStyle = T.itTitle;
      ctx.textBaseline = 'top';
      ctx.fillText(km.kt, x, yy + (kidLineH - kidS) / 2);
      yy += kidLineH;
      if (km.kdl.length) yy += kidTagGap;
    }
    if (km.kdl.length) {
      setFont(ctx, itS, 400);
      yy = drawDescLines(ctx, km.kdl, km.kd, x + km.dInd, yy, itLh, T.itDesc, T.itNew, T.itVal, T.itValBg);
    }
    return yy;
  };
  const drawKids = (kms, x, y) => {
    let yy = y;
    kms.forEach((km, i) => {
      yy = drawKid(km, x, yy);
      if (i < kms.length - 1) yy += kidGapY;
    });
    return yy;
  };

  /* 方案B：左侧完整立绘（16:9 不裁切）+ 右侧文字；卡高由文字决定并统一 */
  const imgMetrics = (it, w, pw) => {
    const ak = portraitKey(it.t, T.avatars);
    const sp = splitItem(it.t);
    if (ak && !sp.name) {
      /* 纯棋手名卡片压图名字保留「（续）」，让读者知道这张是接上一页的 */
      const cont = /[（(]\s*续\s*[)）]\s*$/.test(String(it.t || ''));
      sp.name = ak + (cont ? '（续）' : '');
      sp.skill = '';
    }
    const im = ak ? PORTRAIT_IMGS[ak] : null;
    /* 内置原皮封面没解码完也按 1:1 算，页面一打开就是最终排版，不会跳一下 */
    const ar = (im && im.naturalWidth) ? im.naturalHeight / im.naturalWidth
      : (BUILTIN_AVATARS.has(ak) ? 1 : 0.5625);
    /* 方形封面（08_皮肤的原皮封面）比 16:9 横版高，按比例收窄，卡片高度不至于暴涨 */
    const iw = Math.round((pw || thumbW(w)) * (ar > 0.72 ? 0.62 : 1));
    const ih = Math.round(iw * ar);
    const twx = Math.max(itPad * 4, Math.min(w - iw - itPad * 2, lineR - (pad + bodyPad) - iw - itPad));
    setFont(ctx, imgSkillS, 700);
    const sl = sp.skill ? wrapText(ctx, sp.skill, twx) : [];
    setFont(ctx, itS, 400);
    const dt = splitAwaken(it.d);
    const dl = dt ? wrapText(ctx, dt, twx) : [];
    /* 技能子条目排在说明下面，一个棋手可挂多个 */
    const kms = measureKids(it, twx);
    const kh = kidsBlockH(kms);
    const bodyH = (sl.length + dl.length) * itLh;
    /* 技能块与正文之间留出明显间距，避免技能看起来像正文的续行 */
    const kgap = (kh && bodyH) ? Math.round(kidGapY * 1.6) : 0;
    const textH = bodyH + kgap + kh;
    return { ak, sp, iw, ih, twx, sl, dl, kms, kh, kgap, textH, h: Math.max(itPad * 2 + textH, ih + itPad * 2) };
  };
  const measureImg = (it, w, pw) => imgMetrics(it, w, pw).h;

  /* --- 表格条目：同形态纯数值调整合并后的三列表格 --- */
  const tblPadX = itPad * 0.55;
  const tblRowH = Math.round(itS * T.itLhF + itPad * 1.05);
  const tblTitleH = Math.round(itS * 1.9);
  const tblColW = [0.42, 0.29, 0.29];
  const measureTable = (it) => {
    const n = ((it.table && it.table.rows) ? it.table.rows.length : 0) + 1;
    return tblRowH * Math.max(2, n) + (String(it.t || '').trim() ? tblTitleH : 0);
  };
  const fitCell = (txt, maxW) => {
    let str = String(txt == null ? '' : txt);
    if (ctx.measureText(str).width <= maxW) return str;
    while (str.length > 1 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
    return str + '…';
  };
  const drawValueTable = (it, x, y, w, h) => {
    const tb = it.table || {};
    const head = (tb.head || []).slice(0, 3);
    const rows = tb.rows || [];
    const baseCap = String(it.t || '').trim();
    /* 跨页拆开的表格，后一段标题标「（续）」，并重画表头 */
    const cap = baseCap ? baseCap + (it.tblCont ? '（续）' : '') : '';
    const capH = cap ? tblTitleH : 0;
    const n = rows.length + 1;
    const rh = (h - capH) / n;
    const xs = [0, tblColW[0] * w, (tblColW[0] + tblColW[1]) * w, w];
    const line = T.itStroke || 'rgba(0,0,0,0.12)';
    ctx.save();
    rr(ctx, x, y, w, h, itR);
    ctx.clip();
    ctx.fillStyle = T.itFill || '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fillRect(x, y + capH, w, rh);
    ctx.fillStyle = 'rgba(0,0,0,0.022)';
    rows.forEach((_, i) => { if (i % 2 === 1) ctx.fillRect(x, y + capH + rh * (i + 1), w, rh); });
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, m * 0.0016 * s);
    for (let i = 1; i <= rows.length; i++) {
      ctx.beginPath(); ctx.moveTo(x, y + capH + rh * (i + 1)); ctx.lineTo(x + w, y + capH + rh * (i + 1)); ctx.stroke();
    }
    ctx.restore();
    rr(ctx, x, y, w, h, itR);
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, m * (T.itStrokeW || 0.0022) * s);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    if (cap) {
      setFont(ctx, itS, 700);
      ctx.fillStyle = T.itTitle;
      ctx.textAlign = 'left';
      ctx.fillText(fitCell(cap, w - tblPadX * 2), x + tblPadX, y + capH / 2);
    }
    const cy = i => y + capH + rh * i + rh / 2;
    const put = (txt, ci, ry) => {
      const maxW = Math.max(itS, (xs[ci + 1] - xs[ci]) - tblPadX * 2);
      const str = fitCell(txt, maxW);
      if (ci === 0) { ctx.textAlign = 'left'; ctx.fillText(str, x + tblPadX, ry); }
      else { ctx.textAlign = 'center'; ctx.fillText(str, x + (xs[ci] + xs[ci + 1]) / 2, ry); }
    };
    setFont(ctx, itS, 700);
    ctx.fillStyle = T.itTitle;
    head.forEach((v, ci) => put(v, ci, cy(0)));
    setFont(ctx, itS, 400);
    rows.forEach((r, ri) => {
      r.slice(0, 3).forEach((v, ci) => {
        ctx.fillStyle = ci === 0 ? T.itTitle : T.itDesc;
        put(v, ci, cy(ri + 1));
      });
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  };

  const blocks = [];
  /* 标题条 / 分组胶囊按可用宽度折行，行数与高度随文字长短变化 */
  const barLines = (text, fs, weight, maxW) => {
    setFont(ctx, fs, weight);
    return wrapText(ctx, text, maxW);
  };
  (sections || []).forEach(sec => {
    /* 没有名称的章节不画标题条，也不占高度 */
    if ((sec.name || '').trim()) {
      const sl = barLines(sec.name, secS, 700, barTextW(secPadL));
      blocks.push({ type: 'sec', text: sec.name, cont: !!sec.cont, lines: sl, h: barH(secBarH, secLh, sl.length) });
    }
    (sec.groups || []).forEach(grp => {
      const its = (grp.items || []).filter(it =>
        (it.t || '').trim() !== '' || (it.d || '').trim() !== ''
        || (Array.isArray(it.kids) && it.kids.length));
      /* 分组头下面没有内容就不画，避免页尾出现孤立的蓝色标签 */
      if (!its.length) return;
      /* 没有名称的分组不占标签高度，条目直接排在上一块下面 */
      if ((grp.name || '').trim()) {
        const gl = barLines(grp.name, grpS, 700, barTextW(grpPadL));
        blocks.push({ type: 'grp', text: grp.name, lines: gl, h: barH(grpH, grpLh, gl.length) });
      }

      /* 立绘只属于棋手：英雄调整等同名条目（如「镜」）不能复用棋手立绘 */
      const grpUseImg = useImg && /棋手/.test(grp.name || '');
      /* 按原文顺序排：「闹闹」这类三级标签与紧跟其后的技能条目合成同一张立绘卡 */
      const units = [];
      for (let k = 0; k < its.length; k++) {
        const it = its[k];
        const ak = grpUseImg ? portraitKey(it.t, T.avatars) : '';
        if (ak && it.sub && !(Array.isArray(it.kids) && it.kids.length)) {
          /* 只并入紧跟其后的第一条（该棋手的技能），后面的条目各自成卡，
             否则「弈星」会把后面的安琪拉、6级天赋调整一起吞进同一张卡；
             「6级天赋领取逻辑调整」这类规则条目不是技能，不能被并进来 */
          const nxt = (k + 1 < its.length) ? its[k + 1] : null;
          const first = (nxt && !nxt.sub && !isRuleTitle(nxt.t)) ? its[++k] : null;
          if (first) {
            units.push({ it: { t: first.t ? it.t + ' · ' + first.t : it.t, d: first.d || '' }, img: true });
          } else {
            units.push({ it, img: true });
          }
          continue;
        }
        units.push({ it, img: !!ak });
      }
      const imgUnits = units.filter(u => u.img);

      if (!imgUnits.length) {
        const rows = [];
        let buf = [];
        const flushBuf = () => {
          if (!buf.length) return;
          const rs = layoutGrid(buf, cols, colW, (it) => {
            if (it.sub) return itS * 1.7 + itPad * 2;
            setFont(ctx, itS, 700);
            const tl = String(it.t || '').trim() ? wrapText(ctx, it.t, tw0) : [];
            setFont(ctx, itS, 400);
            const dt = splitAwaken(it.d);
            const dl = dt ? wrapText(ctx, dt, tw0) : [];
            const kh = kidsBlockH(measureKids(it, tw0));
            const kgap = (kh && (tl.length + dl.length)) ? Math.round(kidGapY * 1.2) : 0;
            return (tl.length + dl.length) * itLh + itemPadY(it) * 2 + kgap + kh;
          });
          rs.forEach(r => r.cells.forEach(c => { c.tw = tw0; }));
          rows.push(...rs);
          buf = [];
        };
        its.forEach(it => {
          /* 表格必须满宽，不能塞进多列网格 */
          if (it.table) {
            flushBuf();
            const th = measureTable(it);
            rows.push({ cells: [{ it, kind: 'table', wide: true, w: gridW, h: th }], h: th });
          } else buf.push(it);
        });
        flushBuf();
        blocks.push({ type: 'rows', rows });
        return;
      }

      /* 方案B：立绘条目全部单列横卡，一条一行，图左文右。
         每张卡按自身内容定高：立绘决定最低高度，文字更多时才变高；
         文字条目保持原位置，与立绘卡按原文顺序交错 */
      const panelW = thumbW(gridW);
      const rows = units.map(u => {
        if (u.img) {
          const h = measureImg(u.it, gridW, panelW);
          return { cells: [{ it: u.it, kind: 'img', wide: true, w: gridW, h, iw: panelW }], h };
        }
        const it = u.it;
        if (it.table) {
          const th = measureTable(it);
          return { cells: [{ it, kind: 'table', wide: true, w: gridW, h: th }], h: th };
        }
        if (it.sub) {
          return { cells: [{ it, kind: 'txt', w: gridW, tw: tw0, h: 0 }], h: itS * 1.7 + itPad * 2 };
        }
        setFont(ctx, itS, 700);
        const tl = String(it.t || '').trim() ? wrapText(ctx, it.t, tw0) : [];
        setFont(ctx, itS, 400);
        const dt = splitAwaken(it.d);
        const dl = dt ? wrapText(ctx, dt, tw0) : [];
        const kh = kidsBlockH(measureKids(it, tw0));
        const kgap = (kh && (tl.length + dl.length)) ? Math.round(kidGapY * 1.2) : 0;
        return {
          cells: [{ it, kind: 'txt', w: gridW, tw: tw0, h: 0 }],
          h: (tl.length + dl.length) * itLh + itemPadY(it) * 2 + kgap + kh
        };
      });
      blocks.push({ type: 'rows', rows });
    });
  });

  let contentH = bodyPad, prev = null;
  blocks.forEach(b => {
    if (b.type === 'sec') {
      /* 续页首块不再画章节条，高度也不占 */
      if (!(b.cont && prev === null)) {
        if (prev !== null) contentH += secGapT;
        contentH += (b.h || secBarH);
      }
    }
    else if (b.type === 'grp') { contentH += grpGapT + (b.h || grpH) + grpGapB; }
    else { b.rows.forEach((r, i) => { contentH += r.h + (i < b.rows.length - 1 ? itGap : 0); }); }
    prev = b.type;
  });
  contentH += tipRes + bodyPad;

  const bodyTop = topY + banH + gapBanBody;

  const bottom = bodyTop + contentH;
  /* 多张时统一用最高那张的卡片高度：内容少的那张也不会变成小卡片 */
  const bodyH = Math.max(contentH, cfg.cardH || 0);

  /* --- 主体卡 --- */
  if (T.bodyFill) {
    ctx.save();
    if (T.bodyShadow) { ctx.shadowColor = T.bodyShadow; ctx.shadowBlur = m * 0.030 * s; ctx.shadowOffsetY = m * 0.008 * s; }
    rr(ctx, pad, bodyTop, cw, bodyH, bodyR);
    ctx.fillStyle = T.bodyFill; ctx.fill();
    ctx.restore();
  }
  if (T.bodyStroke) {
    ctx.strokeStyle = T.bodyStroke;
    ctx.lineWidth = Math.max(1, m * T.bodyStrokeW * s);
    rr(ctx, pad, bodyTop, cw, bodyH, bodyR); ctx.stroke();
  }

  /* --- 顶栏卡 --- */
  if (T.banFill && !noTitle) {
    ctx.save();
    if (T.banShadow) { ctx.shadowColor = T.banShadow; ctx.shadowBlur = m * 0.028 * s; ctx.shadowOffsetY = m * 0.006 * s; }
    rr(ctx, pad, topY, cw, banH, banR);
    if (Array.isArray(T.banFill)) {
      const g = ctx.createLinearGradient(pad, topY, pad + cw, topY + banH);
      g.addColorStop(0, T.banFill[0]); g.addColorStop(1, T.banFill[1]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = T.banFill;
    }
    ctx.fill();
    ctx.restore();
  }
  if (T.banStroke && !noTitle) {
    ctx.strokeStyle = T.banStroke;
    ctx.lineWidth = Math.max(1.5, m * T.banStrokeW * s);
    rr(ctx, pad, topY, cw, banH, banR); ctx.stroke();
  }
  if (T.banDecor && !noTitle) T.banDecor(ctx, { x: pad, y: topY, w: cw, h: banH, m, s, gap: gapBanBody });

  /* --- 顶栏文字（可居中） --- */
  if (!noTitle) {
  let ty = topY + banPad;
  const centerBan = !!T.banCenter;
  const textX = centerBan ? W / 2 : pad + banPad;
  ctx.textAlign = centerBan ? 'center' : 'left';
  ctx.save();
  if (T.titleGlow) { ctx.shadowColor = T.titleGlow; ctx.shadowBlur = m * T.titleGlowBlur * s; ctx.shadowOffsetY = m * 0.004 * s; }
  setFont(ctx, tS, T.tWeight);
  if (T.titleGradient) {
    const tg = ctx.createLinearGradient(textX - titleW * 0.45, ty, textX + titleW * 0.45, ty + tLines.length * tLh);
    tg.addColorStop(0, T.titleGradient[0]);
    tg.addColorStop(1, T.titleGradient[1]);
    ctx.fillStyle = tg;
  } else {
    ctx.fillStyle = T.titleColor;
  }
  tLines.forEach((l, i) => ctx.fillText(l, textX + (centerBan ? inkShift(ctx, l) : 0), ty + i * tLh));
  ctx.restore();
  ty += tLines.length * tLh;
  if (sLines.length) {
    ty += m * 0.016 * s;
    setFont(ctx, subS, T.subWeight);
    sLines.forEach((l, i) => {
      const mt = ctx.measureText(l);
      /* 没有墨迹包围盒时按「文字已居中」处理（dx=0），否则会把文字整体左移半个字宽 */
      const hasInk = isFinite(mt.actualBoundingBoxLeft) && isFinite(mt.actualBoundingBoxRight);
      const aL = hasInk ? mt.actualBoundingBoxLeft : mt.width / 2;
      const aR = hasInk ? mt.actualBoundingBoxRight : mt.width / 2;
      const inkW = Math.max(0, aL + aR);
      const lw = centerBan ? inkW : mt.width;
      const dx = centerBan ? (aL - aR) / 2 : 0;
      const pillW = lw + pillPadX * 2;
      const pillX = centerBan ? textX - pillW / 2 : pad + banPad;
      const py = ty + i * subLh + (subLh - pillH) / 2;
      if (T.subPill) {
        const bg = ctx.createLinearGradient(pillX, py, pillX + pillW, py + pillH);
        bg.addColorStop(0, T.subPill.fill[0]);
        bg.addColorStop(1, T.subPill.fill[1]);
        rr(ctx, pillX, py, pillW, pillH, pillH * 0.5);
        ctx.fillStyle = bg;
        ctx.fill();
      }
      ctx.fillStyle = T.subColor;
      if (T.subPill) {
        /* 胶囊里的字按「可见墨迹」垂直居中：中文字面自带上下留白，按字号算会偏高、贴着胶囊上边框 */
        ctx.textBaseline = 'alphabetic';
        const ma = ctx.measureText(l);
        const asc = isFinite(ma.actualBoundingBoxAscent) ? ma.actualBoundingBoxAscent : subS * 0.78;
        const dsc = isFinite(ma.actualBoundingBoxDescent) ? ma.actualBoundingBoxDescent : subS * 0.22;
        ctx.fillText(l, centerBan ? textX + dx : pad + banPad + pillPadX, py + (pillH + asc - dsc) / 2);
        ctx.textBaseline = 'top';
      } else {
        ctx.fillText(l, centerBan ? textX + dx : pad + banPad + pillPadX, py);
      }
    });
  }
  }
  ctx.textAlign = 'left';

  /* --- 立绘卡：左侧完整 16:9 立绘（不裁切，名字压图）+ 右侧技能说明 --- */
  const drawImgCard = (c, x, y, w, h, pw) => {
    const mt = imgMetrics(c.it, w, pw);
    const sp = mt.sp, iw = mt.iw, ih = mt.ih, twx = mt.twx, sl = mt.sl, dl = mt.dl;
    const im = mt.ak ? PORTRAIT_IMGS[mt.ak] : null;
    /* 文字没超过立绘高度时整体垂直居中；
       文字比立绘高（香香这种长卡）时不跟着文字往下沉，贴回卡片顶部内边距 */
    const iy = mt.textH > ih ? y + itPad : y + Math.round((h - ih) / 2);

    ctx.save();
    if (T.itShadow) {
      ctx.shadowColor = T.itShadow; ctx.shadowBlur = m * 0.016 * s; ctx.shadowOffsetY = m * 0.004 * s;
    }
    rr(ctx, x, y, w, h, itR);
    ctx.fillStyle = T.itFill; ctx.fill();
    ctx.restore();

    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      rr(ctx, x, y, w, h, itR);
      ctx.clip();
      /* 盒子与图片同比例 → 完整显示，无裁切 */
      ctx.drawImage(im, x, iy, iw, ih);

      /* 名字压图：图片底部暗色渐变 + 金色竖条 + 白字 */
      const gy = iy + ih * 0.52;
      const sg = ctx.createLinearGradient(0, gy, 0, iy + ih);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, 'rgba(0,0,0,' + (T.itNameScrim * 0.55).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.94, T.itNameScrim + 0.06).toFixed(3) + ')');
      ctx.fillStyle = sg;
      ctx.fillRect(x, gy, iw, iy + ih - gy);

      if (sp.name) {
        const nmS = Math.min(imgNameS, ih * 0.27);
        const barW = Math.max(3, m * 0.0062 * s);
        const barH = nmS * 0.86;
        /* 名字贴图片左下角，留一点内边距 */
        const nx = x + Math.round(iw * 0.035);
        const ny = iy + ih - Math.round(nmS * 0.34) - 8;
        ctx.fillStyle = T.itNameBar;
        rr(ctx, nx, ny - barH / 2, barW, barH, barW * 0.45); ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = m * 0.012 * s;
        ctx.shadowOffsetY = m * 0.002 * s;
        setFont(ctx, nmS, 800);
        ctx.fillStyle = T.itNameColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(sp.name, nx + barW + nmS * 0.22, ny + 1);
        ctx.restore();
        ctx.textBaseline = 'top';
      }
      ctx.restore();
    }

    if (T.itStroke) {
      ctx.strokeStyle = T.itStroke; ctx.lineWidth = Math.max(1, m * T.itStrokeW * s);
      rr(ctx, x, y, w, h, itR); ctx.stroke();
    }

    const tx = x + iw + itPad;
    /* 文字整体相对卡片垂直居中 */
    let yy = y + Math.max(itPad, (h - mt.textH) / 2);
    if (sl.length) {
      setFont(ctx, imgSkillS, 700);
      ctx.fillStyle = T.itTitle;
      sl.forEach(l => { ctx.fillText(l, tx, yy); yy += itLh; });
    }
    if (dl.length) {
      setFont(ctx, itS, 400);
      yy = drawDescLines(ctx, dl, splitAwaken(c.it.d), tx, yy, itLh, T.itDesc, T.itNew, T.itVal, T.itValBg);
    }
    if (mt.kms.length) {
      if (sl.length || dl.length) yy += mt.kgap;
      setFont(ctx, itS, 400);
      drawKids(mt.kms, tx, yy);
    }
  };

  /* --- 正文 --- */
  /* 从卡片顶部开始排，不在卡内垂直居中（居中会在顶部留出大片空白） */
  let y = bodyTop + bodyPad;
  prev = null;
  let secIdx = 0;
  blocks.forEach(b => {
    if (b.type === 'sec') {
      /* 续页不重复章节标题 */
      if (!(b.cont && prev === null)) {
        if (prev !== null) y += secGapT;
        secIdx++;
        const sh = b.h || secBarH;
        const sl = b.lines || [b.text];
        if (T.secFill) { rr(ctx, left, y, innerW, sh, secR); ctx.fillStyle = T.secFill; ctx.fill(); }
        if (T.secAccent) { rr(ctx, left, y, m * 0.009 * s, sh, m * 0.004 * s); ctx.fillStyle = T.secAccent; ctx.fill(); }
        if (T.secRule) {
          ctx.strokeStyle = T.secRule; ctx.lineWidth = Math.max(1, m * 0.0022 * s);
          ctx.beginPath(); ctx.moveTo(left, y + sh); ctx.lineTo(left + innerW, y + sh); ctx.stroke();
        }
        setFont(ctx, secS, 700);
        ctx.fillStyle = T.secText;
        ctx.textBaseline = 'middle';
        const sy = y + (sh - sl.length * secLh) / 2;
        sl.forEach((l, i) => ctx.fillText(l, left + secPadL, sy + secLh * (i + 0.5) + 1));
        ctx.textBaseline = 'top';
        if (T.secDecor) T.secDecor(ctx, { x: left, y, w: innerW, h: sh, m, s, idx: secIdx, text: b.text });
        y += sh;
      }
    } else if (b.type === 'grp') {
      y += grpGapT;
      if (b.text) {
        const gh = b.h || grpH;
        const gl = b.lines || [b.text];
        setFont(ctx, grpS, 700);
        let gw = 0;
        gl.forEach(l => { gw = Math.max(gw, ctx.measureText(l).width); });
        gw = Math.min(innerW, gw + m * 0.052 * s);
        if (T.grpFill) { rr(ctx, left, y, gw, gh, grpR); ctx.fillStyle = T.grpFill; ctx.fill(); }
        if (T.grpStroke) {
          ctx.strokeStyle = T.grpStroke; ctx.lineWidth = Math.max(1, m * T.grpStrokeW * s);
          rr(ctx, left, y, gw, gh, grpR); ctx.stroke();
        }
        ctx.fillStyle = T.grpText;
        ctx.textBaseline = 'middle';
        const gyl = y + (gh - gl.length * grpLh) / 2;
        gl.forEach((l, i) => ctx.fillText(l, left + grpPadL, gyl + grpLh * (i + 0.5) + 1));
        ctx.textBaseline = 'top';
      }
      y += (b.h || grpH) + grpGapB;
    } else {
      b.rows.forEach((r, i) => {
        const rowW = r.cells.reduce((a, c) => a + (c.w || colW), 0) + colGap * Math.max(0, r.cells.length - 1);
        let cx = left + Math.max(0, (gridW - rowW) / 2);
        r.cells.forEach((c) => {
          const cwid = c.w || colW;
          const x = cx;
          cx += cwid + colGap;

          if (c.kind === 'img') { drawImgCard(c, x, y, cwid, r.h, c.iw); return; }
          if (c.kind === 'table') { drawValueTable(c.it, x, y, cwid, r.h); return; }

          if (c.it.sub) {
            setFont(ctx, itS, 700);
            /* 三级标签：超长时截断避免横向出血 */
            const maxW = Math.max(itS * 4, cwid - itPad * 2);
            let label = String(c.it.t || '');
            if (ctx.measureText(label).width > maxW) {
              while (label.length > 1 && ctx.measureText(label + '…').width > maxW) {
                label = label.slice(0, -1);
              }
              label += '…';
            }
            /* 浅金胶囊底 + 棕金字，两端全圆，垂直居中；左边缘和分组胶囊
               （英雄调整）对齐在同一列，不再往里缩一个条目内边距 */
            const labelW = ctx.measureText(label).width;
            const rowH = itS * 1.7 + itPad * 2;
            const pillH = itS * 1.5;
            const pillW = Math.min(cwid, labelW + itS * 0.95);
            const pillY = y + (rowH - pillH) / 2;
            rr(ctx, x, pillY, pillW, pillH, pillH / 2);
            ctx.fillStyle = T.itValBg || '#f8e7bb';
            ctx.fill();
            ctx.fillStyle = T.itVal || '#b07800';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + itS * 0.48, pillY + pillH / 2 + 1);
            ctx.textBaseline = 'top';
            return;
          }

          if (T.card) {
            if (T.itShadow) {
              ctx.save();
              ctx.shadowColor = T.itShadow; ctx.shadowBlur = m * 0.016 * s; ctx.shadowOffsetY = m * 0.004 * s;
              rr(ctx, x, y, cwid, r.h, itR); ctx.fillStyle = T.itFill; ctx.fill();
              ctx.restore();
            } else {
              rr(ctx, x, y, cwid, r.h, itR); ctx.fillStyle = T.itFill; ctx.fill();
            }
            if (T.itStroke) {
              ctx.strokeStyle = T.itStroke; ctx.lineWidth = Math.max(1, m * T.itStrokeW * s);
              rr(ctx, x, y, cwid, r.h, itR); ctx.stroke();
            }
          } else if (T.itBullet) {
            ctx.fillStyle = T.itBullet;
            ctx.beginPath();
            ctx.arc(x + itIndent * 0.45, y + itPad + itLh * 0.40, m * 0.0075 * s, 0, Math.PI * 2);
            ctx.fill();
          }
          if (!T.card && T.itRule && i < b.rows.length - 1) {
            ctx.strokeStyle = T.itRule; ctx.lineWidth = Math.max(1, m * 0.0018 * s);
            ctx.beginPath();
            ctx.moveTo(x, y + r.h + itGap / 2);
            ctx.lineTo(x + cwid, y + r.h + itGap / 2);
            ctx.stroke();
          }
          if (T.itDecor) T.itDecor(ctx, { x, y, w: cwid, h: r.h, m, s });

          const twx = c.tw || tw0;
          const tx = x + itPad + itIndent;
          /* top 基线让每行文字整体偏上，补半个行距差，让文字在条目卡里真正上下居中 */
          let yy = y + itemPadY(c.it) + (itLh - itS * 0.9) / 2;
          setFont(ctx, itS, 700);
          ctx.fillStyle = isNewTitle(c.it.t) ? T.itNew : T.itTitle;
          if (String(c.it.t || '').trim()) {
            wrapText(ctx, c.it.t, twx).forEach(l => { ctx.fillText(l, tx, yy); yy += itLh; });
          }
          setFont(ctx, itS, 400);
          const dt = splitAwaken(c.it.d);
          const hadText = !!String(c.it.t || '').trim() || !!dt;
          if (dt) yy = drawDescLines(ctx, wrapText(ctx, dt, twx), dt, tx, yy, itLh, T.itDesc, T.itNew, T.itVal, T.itValBg);
          const kms = measureKids(c.it, twx);
          if (kms.length) {
            if (hadText) yy += Math.round(kidGapY * 1.2);
            drawKids(kms, tx, yy);
          }
        });
        y += r.h + (i < b.rows.length - 1 ? itGap : 0);
      });
    }
    prev = b.type;
  });

  /* 底部一行：标语 + 互动引导，与正文同字号、居中 */
  if (tipText) {
    setFont(ctx, itS, 600);
    ctx.textAlign = 'center';
    ctx.fillStyle = T.footColor;
    ctx.fillText(tipText, W / 2, bodyTop + bodyH - bodyPad - itS);
    ctx.textAlign = 'left';
  }
  /* 署名：卡片下方橙色区，右下角 */
  if (foot) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setFont(ctx, Math.round(m * 0.022), 600);
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText(foot, W - pad, H - Math.round(m * 0.018));
    ctx.restore();
  }

  ctx.restore();
  return { bottom: bottom + o, safe: H - pad - Math.round(H * (reserveB || 0)), cardH: bodyH, top: bodyTop };
}

/* =======================  风格八：暖阳活力  ======================= */
/* 暖阳斜纹背景（封面与正文共用） */
function paintSunsetBg(c, W, H, m) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ff9f3c'); g.addColorStop(0.55, '#ff6a4d'); g.addColorStop(1, '#e8415f');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = Math.max(1, m * 0.006);
  const st = Math.round(m * 0.10);
  for (let x = -H; x < W + H; x += st) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.stroke(); }
  c.restore();
}

function paintSunset(ctx, cfg, scale, oy) {
  return paintFlow(ctx, cfg, scale, oy, theme({
    bg: paintSunsetBg,
    banFill: '#ffffff', banR: 0.030, banShadow: 'rgba(120,30,0,0.28)',
    /* 大标题：白卡居中，宝蓝渐变，与橙色背景形成冷暖对比，最显眼 */
    banCenter: true, tS: 0.096, tWeight: 900, tLhF: 1.16,
    titleGradient: ['#0f3d91', '#1a73d1'], titleColor: '#0f3d91', titleGlow: null,
    /* 副标题：金色胶囊，与宝蓝标题形成蓝金搭配 */
    subColor: '#ffffff', subS: 0.078, subLhF: 1.30, subPill: { fill: ['#f6b23c', '#e08a00'], padX: 0.026 },
    bodyFill: '#ffffff', bodyR: 0.034, bodyShadow: 'rgba(120,30,0,0.28)',
    secFill: '#fff2d9', secText: '#8a5a00', secAccent: '#f0a020',
    grpFill: '#1a73d1', grpText: '#ffffff',
    itFill: '#fffaf2', itStroke: 'rgba(240,160,32,0.25)',
    /* 棋手条目：左侧完整 16:9 立绘（不裁切），名字嵌在图片底部 */
    avatars: PORTRAITS, itImg: true, itThumb: 0.48,
    itNameS: 0.042, itNameBar: '#f6b23c', itNameColor: '#ffffff', itNameScrim: 0.88,
    /* 条目文字统一在画面宽度 82.9% 处断行（约 x=895），右侧全部留白 */
    itRight: 0.829,
    itTitle: '#3b2a10', itDesc: '#6f5a3a', footColor: '#b09a7a'
  }));
}

/* =======================  封面  ======================= */
function paintCover(ctx, cfg) {
  const { W, H } = cfg;
  const m = Math.min(W, H);
  const g = v => Math.round(m * v);
  const date = String(cfg.date || '').trim() || String(cfg.title || '').replace(TITLE_SUFFIX, '');
  const theme = String(cfg.theme || '').trim();
  const sub = String(cfg.sub || (String(cfg.server || '') + SUB_SUFFIX));
  /* 金色胶囊：分套封面时用「服别 + 更新重点 · 篇名」，避免与外层已含篇名的 sub 重复 */
  const pill = theme ? (String(cfg.server || '').trim() + SUB_SUFFIX + ' · ' + theme) : sub;
  const foot = String(cfg.foot || '').trim();

  paintSunsetBg(ctx, W, H, m);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* --- 布局参数 --- */
  const cardW = g(0.820), padT = g(0.082), padB = g(0.056), padX = g(0.050);
  const dateS = g(0.160), gameS = g(0.054), gapX = g(0.024), gapY = g(0.046);
  const pillS = g(0.046), pillPad = g(0.038), pillH = Math.round(pillS * 1.62);
  const kickS = g(0.030), kickPadX = g(0.042), kickH = g(0.062);
  const innerW = cardW - padX * 2;

  /* --- 量字：日期与游戏名按墨迹底部对齐，整组按墨迹居中 --- */
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, dateS, 900);
  let dm = ctx.measureText(date);
  let dSize = dateS;
  setFont(ctx, gameS, 800);
  let gm = ctx.measureText(TITLE_SUFFIX);
  const gWid = gm.width;
  const dW0 = (dm.actualBoundingBoxRight || 0) + (dm.actualBoundingBoxLeft || 0);
  const gW0 = (gm.actualBoundingBoxRight || 0) + (gm.actualBoundingBoxLeft || 0);
  /* 一行放不下时收日期字号（按墨迹宽度判断，避免整组出血） */
  if (dW0 + gapX + gW0 > innerW) {
    dSize = Math.round(dateS * Math.max(0.5, (innerW - gapX - gW0) / dW0));
    setFont(ctx, dSize, 900);
    dm = ctx.measureText(date);
  }
  setFont(ctx, gameS, 800);
  gm = ctx.measureText(TITLE_SUFFIX);
  const dateAsc = dm.actualBoundingBoxAscent || dSize * 0.78, dateDsc = dm.actualBoundingBoxDescent || 0;
  const gameAsc = gm.actualBoundingBoxAscent || gameS * 0.78, gameDsc = gm.actualBoundingBoxDescent || 0;
  const lineInkH = Math.max(dateAsc + dateDsc, gameAsc + gameDsc);
  const dInkL = dm.actualBoundingBoxLeft || 0, dInkR = dm.actualBoundingBoxRight || dm.width;
  const gInkL = gm.actualBoundingBoxLeft || 0, gInkR = gm.actualBoundingBoxRight || gWid;
  const dInkW = dInkR + dInkL, gInkW = gInkR + gInkL;

  /* 金色胶囊文字放不下时同步收字号 */
  setFont(ctx, pillS, 800);
  let pw = ctx.measureText(pill).width, pSize = pillS;
  if (pw + pillPad * 2 > innerW) {
    pSize = Math.round(pillS * Math.max(0.6, (innerW - pillPad * 2) / pw));
    setFont(ctx, pSize, 800);
    pw = ctx.measureText(pill).width;
  }

  /* --- 白卡：高度由内容撑开，整体垂直居中 --- */
  const cardH = padT + lineInkH + gapY + pillH + padB;
  const cardX = Math.round((W - cardW) / 2);
  const cardY = Math.round((H - cardH) / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(120,30,0,0.28)';
  ctx.shadowBlur = g(0.030); ctx.shadowOffsetY = g(0.008);
  ctx.fillStyle = '#ffffff';
  rr(ctx, cardX, cardY, cardW, cardH, g(0.056)); ctx.fill();
  ctx.restore();

  const bottomY = cardY + padT + lineInkH;

  /* --- 第一行：日期 + 游戏名（底部对齐，整组按墨迹居中） --- */
  const inkStart = (W - (dInkW + gapX + gInkW)) / 2;
  const dateGrad = ctx.createLinearGradient(0, bottomY - dateAsc, 0, bottomY);
  dateGrad.addColorStop(0, '#0f3d91'); dateGrad.addColorStop(1, '#1a73d1');
  setFont(ctx, dSize, 900);
  ctx.fillStyle = dateGrad;
  ctx.fillText(date, inkStart + dInkL, bottomY - dateDsc);
  setFont(ctx, gameS, 800);
  ctx.fillStyle = '#0f3d91';
  ctx.fillText(TITLE_SUFFIX, inkStart + dInkW + gapX + gInkL, bottomY - gameDsc);

  /* --- 第二行：金色胶囊 --- */
  const py = bottomY + gapY;
  ctx.save();
  ctx.shadowColor = 'rgba(120,30,0,0.30)';
  ctx.shadowBlur = g(0.016); ctx.shadowOffsetY = g(0.006);
  const pg = ctx.createLinearGradient(0, py, 0, py + pillH);
  pg.addColorStop(0, '#f6b23c'); pg.addColorStop(1, '#e08a00');
  ctx.fillStyle = pg;
  rr(ctx, (W - (pw + pillPad * 2)) / 2, py, pw + pillPad * 2, pillH, pillH / 2); ctx.fill();
  ctx.restore();
  setFont(ctx, pSize, 800);
  const pm = ctx.measureText(pill);
  const pAsc = pm.actualBoundingBoxAscent || pSize * 0.78, pDsc = pm.actualBoundingBoxDescent || pSize * 0.22;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pill, W / 2, py + (pillH + pAsc - pDsc) / 2);

  /* --- 「更 新 公 告」：白底金边金字，骑在白卡上边框正中 --- */
  setFont(ctx, kickS, 800);
  const kickW = Math.round(ctx.measureText('更 新 公 告').width + kickPadX * 2);
  const kx = Math.round((W - kickW) / 2), ky = cardY - kickH / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(120,30,0,0.22)';
  ctx.shadowBlur = g(0.014); ctx.shadowOffsetY = g(0.005);
  ctx.fillStyle = '#ffffff';
  rr(ctx, kx, ky, kickW, kickH, kickH / 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#e08a00'; ctx.lineWidth = Math.max(3, g(0.0035));
  rr(ctx, kx, ky, kickW, kickH, kickH / 2); ctx.stroke();
  const km = ctx.measureText('更 新 公 告');
  const kAsc = km.actualBoundingBoxAscent || kickS * 0.78, kDsc = km.actualBoundingBoxDescent || kickS * 0.22;
  ctx.fillStyle = '#b07800';
  ctx.fillText('更 新 公 告', W / 2, ky + (kickH + kAsc - kDsc) / 2);

  /* 署名 */
  ctx.textBaseline = 'middle';
  if (foot) {
    setFont(ctx, g(0.029), 700);
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText(foot, W / 2, H - g(0.070));
  }

  ctx.restore();
}

