require("dotenv").config();
const fs = require("fs");

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const appUrl = process.env.APP_URL;
const name = process.env.LIFF_NAME || "どんぐり小児科 出退勤";
const viewType = process.env.LIFF_VIEW_TYPE || "full";
const existing = process.env.LINE_LIFF_ID;

if (!token || !appUrl) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN と APP_URL が必要です。");
  process.exit(1);
}
if (!/^https:\/\//.test(appUrl)) {
  console.error("APP_URL は https:// で始まる公開URLにしてください。");
  process.exit(1);
}

async function request(url, options={}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

(async () => {
  let liffId = existing;
  if (!liffId) {
    const body = await request("https://api.line.me/liff/v1/apps", {
      method: "POST",
      body: JSON.stringify({
        view: { type: viewType, url: appUrl },
        description: name,
        scope: ["openid", "profile", "chat_message.write"],
        permanentLinkPattern: "concat",
        botPrompt: "none"
      })
    });
    liffId = body.liffId;
    console.log("LIFF app created:", liffId);
  } else {
    await request(`https://api.line.me/liff/v1/apps/${encodeURIComponent(liffId)}`, {
      method: "PUT",
      body: JSON.stringify({
        view: { type: viewType, url: appUrl },
        description: name,
        scope: ["openid", "profile", "chat_message.write"],
        permanentLinkPattern: "concat",
        botPrompt: "none"
      })
    });
    console.log("LIFF app updated:", liffId);
  }

  const envPath = ".env";
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (/^LINE_LIFF_ID=.*$/m.test(env)) env = env.replace(/^LINE_LIFF_ID=.*$/m, `LINE_LIFF_ID=${liffId}`);
  else env += `\nLINE_LIFF_ID=${liffId}\n`;
  fs.writeFileSync(envPath, env);

  console.log(`LIFF URL: https://liff.line.me/${liffId}`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
