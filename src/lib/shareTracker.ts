// 分享页阅读追踪：每秒累计「页面可见秒数 / 活跃秒数 / 滚动秒数」，滚动时更新最大深度；
// 每 5 秒心跳上报累计快照，页面隐藏或关闭时用 sendBeacon 补发最终值。
// 活跃 = 页面在前台且 30 秒内有过滑动、按键、点按或鼠标移动（挂后台看别的不算看）。
// 服务端按单调最大值存储，乱序到达的心跳不会把数据冲小。
export function startShareTracking(token: string): () => void {
  let sessionId: string | null = null;
  let visibleSec = 0;
  let activeSec = 0;
  let scrollSec = 0;
  let maxDepth = 0;
  let lastInteractAt = Date.now();
  let lastScrollAt = 0;
  let stopped = false;

  const markInteract = () => {
    lastInteractAt = Date.now();
  };
  const measureDepth = () => {
    const el = document.documentElement;
    const total = el.scrollHeight - el.clientHeight;
    const depth = total > 0 ? Math.min(100, Math.round((el.scrollTop / total) * 100)) : 100;
    if (depth > maxDepth) maxDepth = depth;
  };
  const onScroll = () => {
    markInteract();
    lastScrollAt = Date.now();
    measureDepth();
  };

  const tick = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    visibleSec += 1;
    if (Date.now() - lastInteractAt <= 30_000) activeSec += 1;
    if (lastScrollAt > 0 && Date.now() - lastScrollAt <= 1500) scrollSec += 1;
  }, 1000);

  const send = (ended: boolean) => {
    if (!sessionId || stopped) return;
    const body = JSON.stringify({ visibleSec, activeSec, scrollSec, maxScrollDepth: maxDepth, ended });
    const url = `/api/share/${token}/view/${sessionId}`;
    if (ended && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
      } catch {
        /* 回退到 fetch */
      }
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive: ended,
    }).catch(() => undefined);
  };

  const heartbeat = window.setInterval(() => send(false), 5000);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') send(true);
  };
  const onPageHide = () => send(true);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', markInteract);
  window.addEventListener('mousemove', markInteract, { passive: true });
  window.addEventListener('touchstart', markInteract, { passive: true });
  window.addEventListener('click', markInteract);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  measureDepth();

  void (async () => {
    try {
      const res = await fetch(`/api/share/${token}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      const json = (await res.json().catch(() => null)) as { session?: { id: string } } | null;
      sessionId = json?.session?.id ?? null;
      if (sessionId) send(false);
    } catch {
      /* 追踪失败不影响阅读 */
    }
  })();

  return () => {
    send(true);
    stopped = true;
    window.clearInterval(tick);
    window.clearInterval(heartbeat);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', markInteract);
    window.removeEventListener('mousemove', markInteract);
    window.removeEventListener('touchstart', markInteract);
    window.removeEventListener('click', markInteract);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}
