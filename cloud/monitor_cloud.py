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

import hashlib
import json
import os
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
HEARTBEAT_PATH = BASE_DIR / "last_run.txt"

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


def build_email_html(new_items: list) -> str:
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
    return ('<div style="font-family:Microsoft YaHei,Arial,sans-serif;'
            'max-width:640px;margin:0 auto;padding:16px">'
            '<h2 style="color:#333">王者万象棋 新内容提醒</h2>'
            f'<p style="color:#555">检测到 {len(new_items)} 条新内容：</p>'
            + "".join(rows) +
            '<p style="color:#aaa;font-size:12px">本邮件由万象棋公告监控（GitHub Actions 云端版）自动发送 · '
            '<a href="https://wxq.qq.com/cp/a20260707sfgw/newslist.html">'
            '官网新闻列表</a></p></div>')


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
    if not new_items:
        log("没有新内容。")
        ping_ok()
        return

    new_items.sort(key=lambda x: x["time"], reverse=True)
    for it in new_items:
        log(f"★ 新{it['kind']}：{it['title']}  {it['time']}")
        log(f"   链接：{it['url']}")

    titles = [it["title"] for it in new_items]
    label = "新公告" if any(it["kind"] == "公告" for it in new_items) else "新内容"
    subject = f"万象棋{label}：{titles[0]}" + (f" 等{len(new_items)}条" if len(new_items) > 1 else "")
    try:
        send_email(subject, build_email_html(new_items))
        log(f"提醒邮件已发送至 {os.environ['TO_ADDRS']}")
    except Exception as ex:
        log(f"邮件发送失败：{ex}（内容不入账，下次运行自动重试）")
        sys.exit(1)

    for it in new_items:
        seen[it["id"]] = it["title"]
    save_seen(seen)
    log("账本已更新，workflow 将自动提交回仓库。")
    ping_ok()


if __name__ == "__main__":
    main()
