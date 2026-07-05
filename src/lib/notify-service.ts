export async function sendDingTalkAlert(title: string, text: string) {
  const webhook = process.env.DINGTALK_WEBHOOK_URL?.trim();
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { title, text },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 通知失败不阻塞主流程
  }
}
