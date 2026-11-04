# -*- coding: utf-8 -*-
"""
王者万象棋公告监控 - GitHub Actions 云端版

与本地版区别：
  - 不常驻循环：每次由 GitHub Actions 定时唤起，只扫描一轮就退出
  - 不弹 Windows 通知（云端没有你的桌面），只发邮件
  - 邮箱配置从环境变量（GitHub Secrets）读取，不落文件
  - 已读账本 seen_announcements.json 存在仓库里，发现新公告后由
    workflow 自动 commit 回仓库

邮件失败时不会把公告写入账本 → 下一次定时任务自动重试。
"""

import difflib
import hashlib
import html
import json
import os
import re
import smtplib
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
SEEN_PATH = BASE_DIR / "seen_announcements.json"
BODY_STATE_PATH = BASE_DIR / "body_state.json"
HEARTBEAT_PATH = BASE_DIR / "last_run.txt"
# 上一版正文快照：改动时用来算 diff，提醒里直接显示改了哪几行
SNAP_DIR = BASE_DIR / "body_snapshots"

# ===== 万象棋官网新闻接口（与本地版完全一致）=====
API_URL = "https://apps.game.qq.com/cmc/cross"
API_SECRET = "9784d353d1f9ca34a59b61752630dade"
API_SOURCE = "web_pc"
API_BIZ = "389"
CHANID_ANNOUNCEMENT = "7061"  # 公告
CHANID_COLUMN = "7063"        # 栏目（万万有看到等官方栏目）
TAB_ANNOUNCEMENT = "7061"     # 详情页 tab 参数，沿用旧值
TAB_COLUMN = "4"              # 详情页 tab 参数：4 = 栏目

DETAIL_URL = "https://wxq.qq.com/cp/a20260707sfgw/newsdetail.html?newsid={newsid}&tab={tab}"
# 出图页（GitHub Pages）：带上 newsid 打开就自动填好第一章（仅适用公告）
DRAW_URL = "https://hzdhzd.github.io/wxq-monitor/auto.html?newsid={newsid}"

# ===== 正文改动监控 =====
# 只盯最近 2 天发布的公告。邮件不限量，这里是 10 分钟一轮、发现改动就发，
# 同一篇在相邻两轮之间的多次改动自然合并成一封。
# 新公告提醒走另一条逻辑，发布时记下正文指纹做基线，之后的第一次改动立即提醒。
DETAIL_API_URL = "https://apps.game.qq.com/wmp/v3.1/public/searchNews.php"
WATCH_DAYS = 2

# 标题过滤关键词（与本地版一致）
TITLE_KEYWORDS = ("更新", "开服", "关服", "体验服", "正式服")
# 栏目分类只提醒这个系列
COLUMN_KEYWORDS = ("万万有看到",)
# 账本标记：栏目分类已完成首次静默入账
COLUMN_BASED_KEY = "_column_based"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Referer": "https://wxq.qq.com/cp/a20260707sfgw/newslist.html",
}


def log(msg: str):
    print(f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC] {msg}", flush=True)


def fetch_channel(chanid: str, tab: str, kind: str, limit: int = 30) -> list:
    ts = str(round(time.time()))
    sign = hashlib.md5((API_SECRET + API_SOURCE + API_BIZ + ts).encode()).hexdigest()
    params = {
        "serviceId": API_BIZ, "withtop": "yes", "logic": "or",
        "typeids": "1,2", "sortby": "sIdxTime", "r1": "userobj",
        "start": "0", "limit": str(limit), "source": API_SOURCE,
        "filter": "channel", "exclusiveChannel": "40",
        "exclusiveChannelSign": sign, "time": ts, "chanid": chanid,
    }
    r = requests.get(API_URL, params=params, headers=HEADERS, timeout=20)
    r.raise_for_status()
    text = r.text
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"接口返回异常：{text[:200]}")
    data = json.loads(text[start:end + 1])
    if data.get("status") != 0:
        raise ValueError(f"接口返回错误：{data.get('msg')}")
    result = []
    for it in data["data"].get("items", []):
        # 栏目里的视频内容 iNewsId 为 0，只有 iId 唯一（详情页也按 iId 打开）
        newsid = it.get("iId") or it.get("iNewsId")
        if not newsid:
            continue
        result.append({
            "id": str(newsid),
            "title": (it.get("sTitle") or "").strip(),
            "time": it.get("sIdxTime") or it.get("sCreated") or "",
            "version": (it.get("sGameVersion") or "").strip(),
            "kind": kind,
            "url": DETAIL_URL.format(newsid=newsid, tab=tab),
            "draw": DRAW_URL.format(newsid=newsid),
        })
    return result


# ---------------------------------------------------------------- 公告正文（改动检测）

def fetch_body(newsid: str) -> str:
    """详情接口返回 JSONP（var searchObj={...}），取 msg.sContent 的正文 HTML。"""
    r = requests.get(DETAIL_API_URL, params={
        "p0": API_BIZ, "source": API_SOURCE, "id": newsid, "_": str(int(time.time() * 1000)),
    }, headers=HEADERS, timeout=20)
    r.raise_for_status()
    text = r.text
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("详情接口返回异常")
    data = json.loads(text[start:end + 1])
    content = (data.get("msg") or {}).get("sContent") or ""
    if not content:
        raise ValueError("详情里没有正文")
    return content


_TAG_BREAK_RE = re.compile(r"<\s*(br|hr)\s*/?\s*>|<\s*/\s*(p|div|li|tr|h[1-6]|section|article|blockquote)\s*>",
                           re.I)
_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style)[^>]*>[\s\S]*?</\1>", re.I)
_CONTROL_RE = re.compile(r"[\ue000-\uf8ff\ufffd]")


def normalize_body(raw: str) -> str:
    """把正文 HTML 归一成纯文本，只用于比对指纹：
    去脚本/样式/图片标签，块级标签转换行，实体解码，去图标字体私用区字符，
    再压掉行内空白和空行。这样图片换地址、空行增删都不会误判为改动。"""
    s = _SCRIPT_RE.sub("", raw or "")
    s = re.sub(r"<img[^>]*>", "", s, flags=re.I)
    s = _TAG_BREAK_RE.sub("\n", s)
    s = _TAG_RE.sub("", s)
    s = html.unescape(s).replace("\u00a0", " ")
    s = _CONTROL_RE.sub("", s)
    lines = []
    for line in s.split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def body_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def snapshot_path(newsid: str) -> Path:
    return SNAP_DIR / f"{newsid}.txt"


def read_snapshot(newsid: str) -> str:
    try:
        return snapshot_path(newsid).read_text(encoding="utf-8")
    except Exception:
        return ""


def write_snapshot(newsid: str, text: str):
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_path(newsid).write_text(text, encoding="utf-8")


def diff_lines(old: str, new: str) -> list:
    """行级差异，「- 旧行」/「+ 新行」，用于提醒里直接看出改了哪里。"""
    if not old:
        return []
    out = []
    for raw in difflib.unified_diff(old.split("\n"), new.split("\n"), lineterm="", n=0):
        if raw.startswith(("+++", "---", "@@")):
            continue
        sign, body = raw[:1], raw[1:].strip()
        if sign not in "+-" or not body:
            continue
        out.append(f"{sign} {body}")
    return out


def parse_publish_time(value: str):
    try:
        return datetime.strptime((value or "").strip(), "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone(timedelta(hours=8)))
    except Exception:
        return None


def load_body_state() -> dict:
    if BODY_STATE_PATH.exists():
        try:
            raw = json.loads(BODY_STATE_PATH.read_text(encoding="utf-8"))
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}
    return {}


def save_body_state(state: dict) -> bool:
    """内容没变就不落盘，避免每轮都产生一次提交。"""
    text = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True)
    if BODY_STATE_PATH.exists():
        try:
            if BODY_STATE_PATH.read_text(encoding="utf-8").strip() == text.strip():
                return False
        except Exception:
            pass
    BODY_STATE_PATH.write_text(text, encoding="utf-8")
    return True


def collect_body_changes(announcements: list):
    """抓最近 2 天公告的正文，与账本里的指纹比对。

    返回 (到期的改动列表, 新的正文账本)。
    账本每篇：{title, hash, notified, count}
      hash      = 最近一次抓到的正文指纹
      notified  = 最近一次提醒时的正文指纹（hash != notified 表示有未提醒的改动）
      count     = 累计检测到的改动次数（提醒标题里的「第N次」）

    邮件不限量：每轮（约 10 分钟）发现改动就立即提醒，不再做冷却；
    冷却只留给微信（Worker 那边）。
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=WATCH_DAYS)
    watched = []
    for it in announcements:
        dt = parse_publish_time(it.get("time", ""))
        if dt and dt >= cutoff:
            watched.append(it)

    state = load_body_state()
    keep, due = {}, []
    for it in watched:
        try:
            text = normalize_body(fetch_body(it["id"]))
            digest = body_hash(text)
        except Exception as ex:
            log(f"正文抓取失败 {it['id']}：{ex}（跳过，下次再试）")
            if it["id"] in state:
                keep[it["id"]] = state[it["id"]]
            continue

        st = state.get(it["id"])
        if not st or not st.get("hash"):
            # 首次见到这篇（新公告首发，或监控刚上线）：静默记基线，不提醒
            keep[it["id"]] = {"title": it["title"], "hash": digest, "notified": digest, "count": 0}
            write_snapshot(it["id"], text)
            continue

        st["title"] = it["title"]
        st.pop("last_push", None)
        if st["hash"] != digest:
            old_text = read_snapshot(it["id"])
            if not old_text:
                # 快照机制刚上线/缺快照：这一轮只补基线，不当作改动提醒
                st["hash"] = digest
                st["notified"] = digest
            else:
                st["count"] = int(st.get("count") or 0) + 1
                st["hash"] = digest
                lines = diff_lines(old_text, text)
                if lines:
                    # 冷却内的多次改动按顺序累加，提醒后清空
                    st["diff"] = (st.get("diff") or []) + lines
                log(f"✎ 正文有改动（第{st['count']}次）：{it['title']}  {it['time']}")
        write_snapshot(it["id"], text)

        # 邮件不限量：有未提醒的改动就本轮发，不做冷却
        if st["hash"] != st.get("notified"):
            due.append({"item": it, "count": int(st["count"]), "diff": st.get("diff") or []})
            st["notified"] = st["hash"]
            st.pop("diff", None)
        keep[it["id"]] = st

    return due, keep


def load_seen() -> dict:
    if SEEN_PATH.exists():
        raw = json.loads(SEEN_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and "read" in raw:  # 兼容中间版本结构
            return raw["read"] or {}
        return raw
    return {}


def save_seen(seen: dict):
    SEEN_PATH.write_text(json.dumps(seen, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- 邮件（配置来自环境变量/Secrets）

def email_configured() -> bool:
    return all(os.environ.get(k, "").strip() for k in ("FROM_ADDR", "AUTH_CODE", "TO_ADDRS"))


def send_email(subject: str, html: str):
    host = (os.environ.get("SMTP_HOST") or "smtp.qq.com").strip()
    port = int((os.environ.get("SMTP_PORT") or "465").strip())
    from_addr = os.environ["FROM_ADDR"].strip()
    auth_code = os.environ["AUTH_CODE"].strip()
    to_addrs = [a.strip() for a in os.environ["TO_ADDRS"].split(",") if a.strip()]

    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header("万象棋公告监控", "utf-8")), from_addr))
    msg["To"] = ", ".join(to_addrs)

    server = smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context())
    try:
        server.login(from_addr, auth_code)
        server.sendmail(from_addr, to_addrs, msg.as_string())
    finally:
        server.quit()


def build_email_html(new_items: list, changes: list) -> str:
    rows = []
    for it in new_items:
        ver = f'（版本 {it["version"]}）' if it.get("version") else ""
        # 出图页只适用公告第一章，栏目内容只给原文链接
        draw = (f'<div style="margin-top:8px">'
                f'<a href="{it["draw"]}" style="display:inline-block;padding:6px 14px;'
                f'background:#1a73e8;color:#fff;border-radius:6px;font-size:13px;'
                f'text-decoration:none">打开出图页（自动填好第一章）</a></div>'
                if it.get("kind") == "公告" else "")
        rows.append(
            f'<div style="border:1px solid #e0e0e0;border-radius:8px;'
            f'padding:12px 16px;margin:10px 0;background:#fafafa">'
            f'<a href="{it["url"]}" style="font-size:16px;color:#1a73e8;'
            f'text-decoration:none;font-weight:bold">{it["title"]}{ver}</a>'
            f'<div style="color:#999;font-size:12px;margin-top:4px">'
            f'{it.get("kind", "公告")} · 发布时间：{it["time"]}</div>'
            f'{draw}</div>')

    change_rows = []
    for ch in changes:
        it = ch["item"]
        diff_html = ""
        if ch.get("diff"):
            diff_rows = []
            for d in ch["diff"]:
                if d.startswith("+"):
                    style = "color:#0b7a3b;"
                elif d.startswith("-"):
                    style = "color:#999;text-decoration:line-through;"
                else:
                    style = "color:#888;"
                diff_rows.append(f'<div style="font-size:12px;line-height:1.7;{style}">'
                                 f'{html.escape(d)}</div>')
            diff_html = (
                f'<div style="margin-top:10px;padding:10px 12px;background:#fff;'
                f'border:1px solid #eee;border-radius:6px">'
                f'<div style="font-size:12px;color:#888;margin-bottom:6px">'
                f'本次改动（- 为原文，+ 为改后）：</div>'
                + "".join(diff_rows) + '</div>')
        change_rows.append(
            f'<div style="border:1px solid #f0d38a;border-left:4px solid #f59e0b;'
            f'border-radius:8px;padding:12px 16px;margin:10px 0;background:#fffaf0">'
            f'<a href="{it["url"]}" style="font-size:16px;color:#b45309;'
            f'text-decoration:none;font-weight:bold">'
            f'【公告有改动·第{ch["count"]}次】{it["title"]}</a>'
            f'<div style="color:#999;font-size:12px;margin-top:4px">'
            f'公告 · 发布时间：{it["time"]}</div>'
            f'{diff_html}'
            f'<div style="margin-top:8px">'
            f'<a href="{it["draw"]}" style="display:inline-block;padding:6px 14px;'
            f'background:#f59e0b;color:#fff;border-radius:6px;font-size:13px;'
            f'text-decoration:none">打开出图页（按最新正文重新出图）</a></div></div>')

    parts = ['<div style="font-family:Microsoft YaHei,Arial,sans-serif;'
             'max-width:640px;margin:0 auto;padding:16px">'
             '<h2 style="color:#333">王者万象棋 公告提醒</h2>']
    if new_items:
        parts.append(f'<p style="color:#555">新发布 {len(new_items)} 条：</p>' + "".join(rows))
    if changes:
        parts.append('<p style="color:#555">已发布的公告正文有改动（每轮检查发现改动就发，同一篇相邻两轮的改动合并为一封）：</p>'
                     + "".join(change_rows))
    parts.append('<p style="color:#aaa;font-size:12px">本邮件由万象棋公告监控（GitHub Actions 云端版）自动发送 · '
                 '<a href="https://wxq.qq.com/cp/a20260707sfgw/newslist.html">'
                 '官网新闻列表</a></p></div>')
    return "".join(parts)


def build_subject(new_items: list, changes: list) -> str:
    parts = []
    if new_items:
        label = "新公告" if any(it["kind"] == "公告" for it in new_items) else "新内容"
        first = new_items[0]["title"]
        more = f" 等{len(new_items)}条" if len(new_items) > 1 else ""
        parts.append(f"【{label}】{first}{more}")
    if changes:
        if len(changes) == 1:
            parts.append(f"【公告有改动·第{changes[0]['count']}次】{changes[0]['item']['title']}")
        else:
            parts.append(f"【公告有改动】{len(changes)}篇公告有新改动")
    return "；".join(parts)


# ---------------------------------------------------------------- 主流程

def touch_heartbeat():
    """心跳文件：超过 20 天没更新才重写一次。
    GitHub 会停用 60 天无任何提交的仓库的定时任务；公告本身平均一周
    发一条（新公告会更新账本触发提交），心跳只是超长静默期的保险，
    同时避免每次运行都提交造成仓库噪音。"""
    need = True
    if HEARTBEAT_PATH.exists():
        try:
            last = datetime.strptime(HEARTBEAT_PATH.read_text(encoding="utf-8").strip(),
                                     "%Y-%m-%d %H:%M UTC")
            need = datetime.now(timezone.utc).replace(tzinfo=None) - last > timedelta(days=20)
        except Exception:
            need = True
    if need:
        HEARTBEAT_PATH.write_text(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), encoding="utf-8")
        log("心跳已更新（防止仓库闲置停用定时任务）。")


def ping_ok():
    """死人开关：每次成功运行向 healthchecks.io 报平安。
    超过设定时间没报（任务停跑/连续失败），healthchecks 会主动发邮件
    提醒你监控挂了。未配置 PING_URL 则跳过，不影响监控本身。"""
    url = (os.environ.get("PING_URL") or "").strip()
    if not url:
        return
    try:
        requests.get(url, timeout=10)
        log("已报平安（healthchecks）。")
    except Exception as ex:
        log(f"报平安失败（不影响监控）：{ex}")


def main():
    touch_heartbeat()

    if not email_configured():
        log("错误：未配置邮件（Secrets 缺少 FROM_ADDR/AUTH_CODE/TO_ADDRS），本次不标记已读。")
        sys.exit(1)

    try:
        announcements = fetch_channel(CHANID_ANNOUNCEMENT, TAB_ANNOUNCEMENT, "公告")
        column = fetch_channel(CHANID_COLUMN, TAB_COLUMN, "栏目")
    except Exception as ex:
        log(f"抓取失败：{ex}")
        sys.exit(1)
    announcements = [it for it in announcements if any(k in it["title"] for k in TITLE_KEYWORDS)]
    column = [it for it in column if any(k in it["title"] for k in COLUMN_KEYWORDS)]
    log(f"官网「公告」共 {len(announcements)} 条，「栏目」共 {len(column)} 条")
    items = announcements + column

    seen = load_seen()
    if not seen:
        for it in items:
            seen[it["id"]] = it["title"]
        seen[COLUMN_BASED_KEY] = "1"
        save_seen(seen)
        log(f"账本为空，已记录 {len(items)} 条历史内容作为基线，不提醒。")
        ping_ok()
        return

    # 栏目分类首次接入：把已有历史内容静默入账，不补发
    if COLUMN_BASED_KEY not in seen:
        added = 0
        for it in column:
            if it["id"] not in seen:
                seen[it["id"]] = it["title"]
                added += 1
        seen[COLUMN_BASED_KEY] = "1"
        save_seen(seen)
        log(f"栏目分类首次接入，已静默记录 {added} 条历史内容，不提醒。")

    new_items = [it for it in items if it["id"] not in seen]
    changes, body_state = collect_body_changes(announcements)

    if not new_items and not changes:
        if save_body_state(body_state):
            log("正文指纹账本已更新。")
        log("没有新内容，也没有公告改动。")
        ping_ok()
        return

    new_items.sort(key=lambda x: x["time"], reverse=True)
    changes.sort(key=lambda ch: ch["item"]["time"], reverse=True)
    for it in new_items:
        log(f"★ 新{it['kind']}：{it['title']}  {it['time']}")
        log(f"   链接：{it['url']}")
    for ch in changes:
        log(f"✎ 到期改动提醒（第{ch['count']}次）：{ch['item']['title']}  {ch['item']['time']}")

    subject = build_subject(new_items, changes)
    try:
        send_email(subject, build_email_html(new_items, changes))
        log(f"提醒邮件已发送至 {os.environ['TO_ADDRS']}")
    except Exception as ex:
        log(f"邮件发送失败：{ex}（内容不入账，下次运行自动重试）")
        sys.exit(1)

    if new_items:
        for it in new_items:
            seen[it["id"]] = it["title"]
        save_seen(seen)
        log("新内容已入账，workflow 将自动提交回仓库。")
    if save_body_state(body_state):
        log("正文指纹账本已更新，workflow 将自动提交回仓库。")
    ping_ok()


if __name__ == "__main__":
    main()
