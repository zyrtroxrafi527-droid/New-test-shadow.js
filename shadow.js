const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require("canvas"));
} catch (e) {
  ({ createCanvas, loadImage } = require("@napi-rs/canvas"));
}

const W = 720;
const FONT = "Arial, Helvetica, sans-serif";

/* ───────────── canvas helpers (premium friendly theme) ───────────── */

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function fitText(ctx, text, maxW, size, weight = "bold") {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
}

function txt(ctx, text, x, y, size, color, align = "left", weight = "bold", maxW = 0) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (maxW) fitText(ctx, String(text), maxW, size, weight);
  else ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillText(String(text), x, y);
}

/* ---- icons (all drawn with shapes, no emoji needed) ---- */
function icon(ctx, name, x, y, s, color) {
  const t = s / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (name) {
    case "heart":
      ctx.beginPath();
      ctx.moveTo(x, y + t * 0.9);
      ctx.bezierCurveTo(x - t * 1.5, y + t * 0.05, x - t * 0.95, y - t * 1.0, x, y - t * 0.3);
      ctx.bezierCurveTo(x + t * 0.95, y - t * 1.0, x + t * 1.5, y + t * 0.05, x, y + t * 0.9);
      ctx.fill();
      break;
    case "bolt":
      ctx.beginPath();
      [[0.15, -1], [-0.6, 0.1], [-0.05, 0.1], [-0.2, 1], [0.6, -0.2], [0.05, -0.2]].forEach((p, i) => {
        i ? ctx.lineTo(x + p[0] * t, y + p[1] * t) : ctx.moveTo(x + p[0] * t, y + p[1] * t);
      });
      ctx.closePath();
      ctx.fill();
      break;
    case "coin": {
      const g = ctx.createLinearGradient(x - t, y - t, x + t, y + t);
      g.addColorStop(0, "#ffe27a");
      g.addColorStop(1, "#e09b00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, t, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,70,0,0.55)";
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.arc(x, y, t * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      txt(ctx, "$", x, y + 1, s * 0.55, "#7a4600", "center", "bold");
      break;
    }
    case "sword":
      s = s * 1.3;
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      rr(ctx, -s * 0.07, -s * 0.52, s * 0.14, s * 0.78, s * 0.06);
      ctx.fill();
      rr(ctx, -s * 0.3, s * 0.2, s * 0.6, s * 0.1, s * 0.04);
      ctx.fill();
      rr(ctx, -s * 0.055, s * 0.3, s * 0.11, s * 0.2, s * 0.04);
      ctx.fill();
      break;
    case "shield":
      ctx.beginPath();
      ctx.moveTo(x, y - t);
      ctx.lineTo(x + t * 0.85, y - t * 0.6);
      ctx.quadraticCurveTo(x + t * 0.85, y + t * 0.55, x, y + t);
      ctx.quadraticCurveTo(x - t * 0.85, y + t * 0.55, x - t * 0.85, y - t * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case "star":
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? t : t * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "trophy":
      ctx.beginPath();
      ctx.moveTo(x - t * 0.6, y - t * 0.85);
      ctx.lineTo(x + t * 0.6, y - t * 0.85);
      ctx.quadraticCurveTo(x + t * 0.6, y + t * 0.3, x, y + t * 0.3);
      ctx.quadraticCurveTo(x - t * 0.6, y + t * 0.3, x - t * 0.6, y - t * 0.85);
      ctx.fill();
      ctx.fillRect(x - t * 0.1, y + t * 0.3, t * 0.2, t * 0.35);
      rr(ctx, x - t * 0.45, y + t * 0.65, t * 0.9, t * 0.2, t * 0.08);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.arc(x - t * 0.68, y - t * 0.45, t * 0.28, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + t * 0.68, y - t * 0.45, t * 0.28, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      break;
    case "scroll":
      rr(ctx, x - t * 0.6, y - t * 0.85, t * 1.2, t * 1.7, t * 0.18);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,10,40,0.6)";
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - t * 0.32, y - t * 0.38 + i * t * 0.42);
        ctx.lineTo(x + t * 0.32, y - t * 0.38 + i * t * 0.42);
        ctx.stroke();
      }
      break;
    case "cross":
      ctx.lineWidth = Math.max(3, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(x - t * 0.6, y - t * 0.6);
      ctx.lineTo(x + t * 0.6, y + t * 0.6);
      ctx.moveTo(x + t * 0.6, y - t * 0.6);
      ctx.lineTo(x - t * 0.6, y + t * 0.6);
      ctx.stroke();
      break;
    case "check":
      ctx.lineWidth = Math.max(3, s * 0.17);
      ctx.beginPath();
      ctx.moveTo(x - t * 0.6, y + t * 0.05);
      ctx.lineTo(x - t * 0.15, y + t * 0.5);
      ctx.lineTo(x + t * 0.65, y - t * 0.5);
      ctx.stroke();
      break;
    case "crown":
      ctx.beginPath();
      [[-1, 0.6], [-1, -0.45], [-0.5, 0.05], [0, -0.75], [0.5, 0.05], [1, -0.45], [1, 0.6]].forEach((p, i) => {
        i ? ctx.lineTo(x + p[0] * t, y + p[1] * t) : ctx.moveTo(x + p[0] * t, y + p[1] * t);
      });
      ctx.closePath();
      ctx.fill();
      break;
    case "potion":
      ctx.beginPath();
      ctx.arc(x, y + t * 0.3, t * 0.68, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, x - t * 0.2, y - t * 0.85, t * 0.4, t * 0.85, t * 0.08);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(x - t * 0.22, y + t * 0.15, t * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(x, y - t);
      ctx.lineTo(x + t * 0.8, y - t * 0.2);
      ctx.lineTo(x, y + t);
      ctx.lineTo(x - t * 0.8, y - t * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.moveTo(x, y - t);
      ctx.lineTo(x - t * 0.8, y - t * 0.2);
      ctx.lineTo(x, y - t * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case "moon":
      ctx.beginPath();
      ctx.arc(x, y, t, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(x - s, y - s, s * 2, s * 2);
      ctx.arc(x + t * 0.5, y - t * 0.2, t * 0.85, 0, Math.PI * 2);
      ctx.clip("evenodd");
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      break;
  }
  ctx.restore();
}

function iconBadge(ctx, name, x, y, r, color) {
  ctx.fillStyle = hexA(color, 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  icon(ctx, name, x, y, r * 1.05, color);
}

function panel(ctx, x, y, w, h, r = 22, accent = null, strong = false) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.11)");
  g.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = accent ? hexA(accent, strong ? 0.95 : 0.5) : "rgba(255,255,255,0.14)";
  ctx.lineWidth = strong ? 3 : 1.5;
  rr(ctx, x, y, w, h, r);
  ctx.stroke();
  // top shine
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y + 1.5);
  ctx.lineTo(x + w - r, y + 1.5);
  ctx.stroke();
}

function chip(ctx, x, y, h, text, color, iconName, align = "center") {
  ctx.font = `bold ${Math.round(h * 0.46)}px ${FONT}`;
  const tw = ctx.measureText(String(text)).width;
  const iw = iconName ? h * 0.5 + 8 : 0;
  const w = tw + iw + h * 0.9;
  const x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  ctx.fillStyle = hexA(color, 0.16);
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.65);
  ctx.lineWidth = 1.5;
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.stroke();
  let tx = x0 + h * 0.45;
  if (iconName) {
    icon(ctx, iconName, tx + h * 0.25, y, h * 0.5, color);
    tx += iw;
  }
  txt(ctx, text, tx, y + 1, Math.round(h * 0.46), "#ffffff", "left", "bold");
  return w;
}

function makeCanvas(h, a1, a2, title, subtitle) {
  const canvas = createCanvas(W, h);
  const ctx = canvas.getContext("2d");

  ctx.save();
  rr(ctx, 14, 14, W - 28, h - 28, 30);
  ctx.clip();

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#150b30");
  g.addColorStop(0.5, "#241047");
  g.addColorStop(1, "#0d0720");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, h);

  glow(ctx, 40, 60, 560, a1, 0.3);
  glow(ctx, W - 30, h * 0.55, 600, a2, 0.22);
  glow(ctx, W * 0.3, h - 20, 480, a1, 0.16);

  const r = seeded(h * 7 + 13);
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const y = r() * h;
    const s = 0.8 + r() * 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.06 + r() * 0.2).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const fg = ctx.createLinearGradient(0, 0, W, h);
  fg.addColorStop(0, a1);
  fg.addColorStop(1, a2);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  rr(ctx, 14, 14, W - 28, h - 28, 30);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  rr(ctx, 24, 24, W - 48, h - 48, 24);
  ctx.stroke();

  icon(ctx, "star", W / 2 - 215, 66, 18, a1);
  icon(ctx, "star", W / 2 + 215, 66, 18, a2);
  txt(ctx, title, W / 2, 66, 36, "#ffffff", "center", "bold", 380);
  if (subtitle) txt(ctx, subtitle, W / 2, 104, 17, "#d9ccff", "center", "bold", W - 140);

  const lg = ctx.createLinearGradient(W / 2 - 130, 0, W / 2 + 130, 0);
  lg.addColorStop(0, hexA(a1, 0));
  lg.addColorStop(0.5, a1);
  lg.addColorStop(1, hexA(a2, 0));
  ctx.strokeStyle = lg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 130, 128);
  ctx.lineTo(W / 2 + 130, 128);
  ctx.stroke();

  icon(ctx, "moon", W / 2 - 78, h - 40, 14, "rgba(255,255,255,0.45)");
  txt(ctx, "Powered by SNIVY HQ", W / 2 + 6, h - 40, 14, "rgba(255,255,255,0.5)", "center", "bold");
  return { canvas, ctx };
}

function bar(ctx, x, y, w, h, pct, c1, c2) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (pct > 0) {
    const fw = Math.max(h, w * pct);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    rr(ctx, x, y, fw, h, h / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    rr(ctx, x + 3, y + 2, Math.max(2, fw - 6), h * 0.38, h * 0.2);
    ctx.fill();
  }
}

function tile(ctx, x, y, w, h, iconName, color, label, value) {
  panel(ctx, x, y, w, h, 20, color);
  iconBadge(ctx, iconName, x + 38, y + 36, 21, color);
  txt(ctx, label, x + 72, y + 36, 14, "rgba(255,255,255,0.65)", "left", "bold", w - 84);
  txt(ctx, value, x + 22, y + h - 32, 30, "#ffffff", "left", "bold", w - 40);
}

function drawAvatar(ctx, img, name, cx, cy, r, c1, c2, ringW = 6) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2 || c1);
  ctx.beginPath();
  ctx.arc(cx, cy, r + ringW, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#150b30";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#2a1650";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    txt(ctx, String(name || "?").charAt(0).toUpperCase(), cx, cy, r, "#ffffff", "center", "bold");
  }
  ctx.restore();
}

function rankInfo(level) {
  if (level >= 20) return { name: "SHADOW LORD", color: "#ffd24a", color2: "#ff9d2e" };
  if (level >= 12) return { name: "PHANTOM", color: "#c46bff", color2: "#7b5cff" };
  if (level >= 6) return { name: "ASSASSIN", color: "#ff5f8a", color2: "#ff9a5f" };
  if (level >= 3) return { name: "ROGUE", color: "#38d6ff", color2: "#5f8aff" };
  return { name: "ROOKIE", color: "#5dff9a", color2: "#38e0c8" };
}

/* ───────────── command ───────────── */

module.exports = {
  config: {
    name: "shadow",
    version: "3.0.0",
    author: "Siken",
    role: 0,
    countDown: 2,
    prefix: true,
    category: "game",
    description: "Shadow Syndicate RPG game (canvas UI)"
  },

  onStart: async function ({ message, event, args, usersData }) {
    const threadID = String(event.threadID);
    const userID = String(event.senderID);
    const action = String(args[0] || "help").toLowerCase();

    if (!global.shadowSyndicate) {
      global.shadowSyndicate = {
        players: {},
        battles: {},
        missions: {}
      };
    }

    const DB = global.shadowSyndicate;

    const makePlayer = id => {
      if (!DB.players[id]) {
        DB.players[id] = {
          level: 1,
          xp: 0,
          coins: 100,
          wins: 0,
          losses: 0,
          hp: 100,
          maxHp: 100,
          power: 15,
          defense: 5,
          energy: 3,
          missions: 0
        };
      }
      return DB.players[id];
    };

    const send = text => message.reply(text);

    const getName = async id => {
      try {
        const n = usersData && (await usersData.getName(id));
        return String(n || id).slice(0, 22);
      } catch (e) {
        return String(id);
      }
    };

    const getAvatar = async id => {
      try {
        const url =
          `https://graph.facebook.com/${id}/picture?width=512&height=512` +
          "&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662";
        const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
        return await loadImage(Buffer.from(res.data));
      } catch (e) {
        return null;
      }
    };

    // sends a canvas card; falls back to plain text if rendering fails
    const sendCard = async (renderFn, body, fallbackText) => {
      let file = null;
      try {
        const canvas = await renderFn();
        const dir = path.join(__dirname, "cache");
        fs.ensureDirSync(dir);
        file = path.join(dir, `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`);
        fs.writeFileSync(file, canvas.toBuffer("image/png"));
        await message.reply({ body: body || "", attachment: fs.createReadStream(file) });
      } catch (e) {
        console.error("[shadow] canvas error:", e);
        await send(fallbackText || body || "Something went wrong.");
      } finally {
        if (file) setTimeout(() => fs.remove(file).catch(() => {}), 15000);
      }
    };

    const rank = level => rankInfo(level).name;

    const addXP = (player, amount) => {
      player.xp += amount;
      let levelUps = 0;

      while (player.xp >= player.level * 100) {
        player.xp -= player.level * 100;
        player.level++;
        player.maxHp += 10;
        player.power += 2;
        player.defense += 1;
        player.hp = player.maxHp;
        player.energy = Math.min(5, player.energy + 1);
        levelUps++;
      }

      return levelUps;
    };

    const getMention = () => {
      const mentions = event.mentions || {};
      const ids = Object.keys(mentions).filter(id => id !== userID);
      if (ids.length) return String(ids[0]);

      const raw = String(args[1] || "");
      const match = raw.match(/\d{5,}/);
      return match ? match[0] : null;
    };

    /* ───── card renderers (premium friendly) ───── */

    const renderHelp = async () => {
      const name = await getName(userID);
      const { canvas, ctx } = makeCanvas(1090, "#a66bff", "#ff6fb5", "SHADOW SYNDICATE", `Hey ${name}! Ready to play?`);
      const rows = [
        ["profile", "crown", "!shadow profile", "#ffd24a"],
        ["mission", "scroll", "!shadow mission", "#38d6ff"],
        ["claim", "check", "!shadow claim", "#5dff9a"],
        ["battle", "sword", "!shadow battle @user", "#ff5f8a"],
        ["attack", "sword", "!shadow attack", "#ff5f8a"],
        ["shield", "shield", "!shadow shield", "#ffd24a"],
        ["heal", "heart", "!shadow heal", "#ff6f91"],
        ["power", "bolt", "!shadow power", "#c46bff"],
        ["shop", "coin", "!shadow shop", "#ffd24a"],
        ["buy", "potion", "!shadow buy potion", "#5dff9a"],
        ["top", "trophy", "!shadow top", "#ffd24a"]
      ];
      let y = 160;
      for (const [label, ic, cmd, color] of rows) {
        panel(ctx, 48, y, W - 96, 70, 20, color);
        iconBadge(ctx, ic, 94, y + 35, 24, color);
        txt(ctx, label.toUpperCase(), 138, y + 35, 21, "#ffffff", "left", "bold", 150);
        chip(ctx, W - 70, y + 35, 40, cmd, color, null, "right");
        y += 80;
      }
      chip(ctx, W / 2, 1010, 44, "Tip: finish missions to earn coins & XP", "#a66bff", "star");
      return canvas;
    };

    const renderProfile = async () => {
      const name = await getName(userID);
      const img = await getAvatar(userID);
      const ri = rankInfo(p.level);
      const { canvas, ctx } = makeCanvas(1110, ri.color, ri.color2, "MY PROFILE", "Welcome back, hero!");

      glow(ctx, W / 2, 275, 220, ri.color, 0.25);
      drawAvatar(ctx, img, name, W / 2, 270, 98, ri.color, ri.color2, 8);
      // level badge
      ctx.fillStyle = "#150b30";
      ctx.beginPath();
      ctx.arc(W / 2 + 76, 340, 34, 0, Math.PI * 2);
      ctx.fill();
      const lg = ctx.createLinearGradient(W / 2 + 42, 306, W / 2 + 110, 374);
      lg.addColorStop(0, ri.color);
      lg.addColorStop(1, ri.color2);
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(W / 2 + 76, 340, 29, 0, Math.PI * 2);
      ctx.fill();
      txt(ctx, p.level, W / 2 + 76, 341, 28, "#150b30", "center", "bold");

      txt(ctx, name, W / 2, 415, 36, "#ffffff", "center", "bold", W - 120);
      chip(ctx, W / 2, 462, 40, ri.name, ri.color, "crown");

      panel(ctx, 48, 510, W - 96, 250, 24);
      const rowY = [540, 612, 684];
      // XP
      icon(ctx, "star", 84, rowY[0], 22, "#ffd24a");
      txt(ctx, "EXPERIENCE", 108, rowY[0], 16, "rgba(255,255,255,0.8)", "left");
      txt(ctx, `${p.xp} / ${p.level * 100}`, W - 78, rowY[0], 17, "#ffffff", "right");
      bar(ctx, 76, rowY[0] + 16, W - 152, 22, p.xp / (p.level * 100), "#8a4dff", "#38d6ff");
      // HP
      icon(ctx, "heart", 84, rowY[1], 22, "#ff6f91");
      txt(ctx, "HEALTH", 108, rowY[1], 16, "rgba(255,255,255,0.8)", "left");
      txt(ctx, `${p.hp} / ${p.maxHp}`, W - 78, rowY[1], 17, "#ffffff", "right");
      bar(ctx, 76, rowY[1] + 16, W - 152, 22, p.hp / p.maxHp, "#ff5f8a", "#5dff9a");
      // Energy
      icon(ctx, "bolt", 84, rowY[2], 22, "#ffd24a");
      txt(ctx, "ENERGY", 108, rowY[2], 16, "rgba(255,255,255,0.8)", "left");
      txt(ctx, `${p.energy} / 5`, W - 78, rowY[2], 17, "#ffffff", "right");
      const pw = (W - 152 - 4 * 10) / 5;
      for (let i = 0; i < 5; i++) {
        const x = 76 + i * (pw + 10);
        ctx.fillStyle = i < p.energy ? "#ffd24a" : "rgba(255,255,255,0.12)";
        rr(ctx, x, rowY[2] + 16, pw, 22, 11);
        ctx.fill();
        if (i < p.energy) {
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          rr(ctx, x + 3, rowY[2] + 18, pw - 6, 8, 4);
          ctx.fill();
        }
      }

      const tw = (W - 96 - 40) / 3;
      const tiles = [
        ["sword", "#ff5f8a", "POWER", p.power],
        ["shield", "#38d6ff", "DEFENSE", p.defense],
        ["coin", "#ffd24a", "COINS", p.coins],
        ["scroll", "#c46bff", "MISSIONS", p.missions],
        ["trophy", "#5dff9a", "WINS", p.wins],
        ["cross", "#ff7a7a", "LOSSES", p.losses]
      ];
      tiles.forEach((t, i) => {
        const x = 48 + (i % 3) * (tw + 20);
        const y = 790 + Math.floor(i / 3) * 130;
        tile(ctx, x, y, tw, 112, t[0], t[1], t[2], t[3]);
      });
      return canvas;
    };

    const renderMission = async m => {
      const name = await getName(userID);
      const lvl = m.risk < 30 ? ["LOW RISK", "#5dff9a"] : m.risk < 45 ? ["MEDIUM RISK", "#ffd24a"] : ["HIGH RISK", "#ff5f8a"];
      const { canvas, ctx } = makeCanvas(740, "#38d6ff", "#a66bff", "NEW MISSION", `Good luck, ${name}!`);

      panel(ctx, 48, 160, W - 96, 170, 24, "#38d6ff");
      iconBadge(ctx, "scroll", 120, 245, 44, "#38d6ff");
      txt(ctx, m.name, 188, 225, 28, "#ffffff", "left", "bold", W - 260);
      chip(ctx, 188, 280, 38, lvl[0], lvl[1], "shield", "left");

      panel(ctx, 48, 355, W - 96, 120, 24);
      txt(ctx, "FAILURE CHANCE", 80, 390, 16, "rgba(255,255,255,0.75)", "left");
      txt(ctx, `${m.risk}%`, W - 80, 390, 22, lvl[1], "right");
      bar(ctx, 76, 414, W - 152, 24, m.risk / 100, "#5dff9a", lvl[1]);
      txt(ctx, "Higher chance = higher rewards. Be brave!", 80, 456, 14, "rgba(255,255,255,0.5)", "left", "bold", W - 160);

      const tw = (W - 96 - 20) / 2;
      tile(ctx, 48, 500, tw, 112, "coin", "#ffd24a", "REWARD", `${m.reward} coins`);
      tile(ctx, 48 + tw + 20, 500, tw, 112, "star", "#5dff9a", "XP", `+${m.xp}`);

      chip(ctx, W / 2, 662, 46, "Type  !shadow claim  to collect", "#38d6ff", "check");
      return canvas;
    };

    const renderClaim = async (m, success, loss, levels) => {
      const name = await getName(userID);
      const c1 = success ? "#5dff9a" : "#ff5f8a";
      const c2 = success ? "#38d6ff" : "#ff9a5f";
      const { canvas, ctx } = makeCanvas(
        750,
        c1,
        c2,
        success ? "MISSION COMPLETE" : "MISSION FAILED",
        success ? `Awesome work, ${name}!` : `Don't give up, ${name}!`
      );

      glow(ctx, W / 2, 250, 200, c1, 0.3);
      const bg = ctx.createLinearGradient(W / 2 - 70, 180, W / 2 + 70, 320);
      bg.addColorStop(0, c1);
      bg.addColorStop(1, c2);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(W / 2, 250, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(W / 2 - 14, 226, 44, Math.PI, Math.PI * 1.9);
      ctx.fill();
      icon(ctx, success ? "check" : "cross", W / 2, 250, 76, "#150b30");

      txt(ctx, m.name, W / 2, 360, 26, "#ffffff", "center", "bold", W - 110);
      chip(ctx, W / 2, 408, 38, rank(p.level), rankInfo(p.level).color, "crown");

      const tw = (W - 96 - 20) / 2;
      if (success) {
        tile(ctx, 48, 450, tw, 112, "coin", "#ffd24a", "COINS", `+${m.reward}`);
        tile(ctx, 48 + tw + 20, 450, tw, 112, "star", "#5dff9a", "XP", `+${m.xp}`);
        tile(ctx, 48, 582, tw, 112, "crown", "#c46bff", "LEVEL", p.level);
        tile(ctx, 48 + tw + 20, 582, tw, 112, "trophy", "#ffd24a", "LEVEL UPS", levels);
      } else {
        tile(ctx, 48, 450, tw, 112, "coin", "#ff7a7a", "COINS LOST", `-${loss}`);
        tile(ctx, 48 + tw + 20, 450, tw, 112, "coin", "#ffd24a", "BALANCE", p.coins);
        chip(ctx, W / 2, 625, 46, "Try another mission: !shadow mission", "#ff9a5f", "scroll");
      }
      return canvas;
    };

    const renderShop = async () => {
      const { canvas, ctx } = makeCanvas(800, "#ffd24a", "#ff9d2e", "SHADOW SHOP", "Treat yourself, warrior!");
      chip(ctx, W / 2, 170, 42, `Your coins: ${p.coins}`, "#ffd24a", "coin");
      const items = [
        ["POTION", 30, "Restores 40 HP", "!shadow buy potion", "#5dff9a", "potion"],
        ["ENERGY CRYSTAL", 50, "Restores 2 energy", "!shadow buy crystal", "#c46bff", "diamond"]
      ];
      items.forEach((it, i) => {
        const y = 215 + i * 245;
        panel(ctx, 48, y, W - 96, 220, 26, it[4]);
        glow(ctx, 140, y + 110, 110, it[4], 0.28);
        iconBadge(ctx, it[5], 140, y + 110, 58, it[4]);
        txt(ctx, it[0], 224, y + 52, 28, "#ffffff", "left", "bold", 270);
        chip(ctx, W - 76, y + 52, 40, `${it[1]} coins`, "#ffd24a", "coin", "right");
        txt(ctx, it[2], 224, y + 108, 20, "rgba(255,255,255,0.8)", "left", "bold", W - 300);
        chip(ctx, 224, y + 166, 40, it[3], it[4], null, "left");
      });
      return canvas;
    };

    const renderArena = async (battle, lastLine) => {
      const idA = battle.a;
      const idB = battle.b;
      const [nameA, nameB, imgA, imgB] = await Promise.all([
        getName(idA),
        getName(idB),
        getAvatar(idA),
        getAvatar(idB)
      ]);
      const pa = makePlayer(idA);
      const pb = makePlayer(idB);
      const { canvas, ctx } = makeCanvas(1000, "#ff5f8a", "#a66bff", "BATTLE ARENA", "May the best shadow win!");

      const block = (id, name, img, pl, y, color) => {
        const active = battle.turn === id;
        const ri = rankInfo(pl.level);
        panel(ctx, 48, y, W - 96, 240, 28, active ? color : null, active);
        if (active) glow(ctx, 140, y + 120, 150, color, 0.2);
        drawAvatar(ctx, img, name, 142, y + 112, 70, active ? color : "rgba(255,255,255,0.35)", active ? ri.color2 : "rgba(255,255,255,0.2)", active ? 8 : 4);
        txt(ctx, name, 246, y + 52, 28, "#ffffff", "left", "bold", W - 300);
        chip(ctx, 246, y + 92, 32, `Lv.${pl.level}  ${ri.name}`, ri.color, "crown", "left");
        icon(ctx, "heart", 262, y + 145, 22, "#ff6f91");
        const hp = battle.hp[id];
        bar(ctx, 286, y + 134, W - 96 - 238 - 8 - 10, 24, hp / pl.maxHp, "#ff5f8a", "#5dff9a");
        txt(ctx, `${hp} / ${pl.maxHp} HP`, 246, y + 184, 17, "#ffffff", "left", "bold");
        if (battle.shield[id]) chip(ctx, W - 76, y + 184, 32, "SHIELD UP", "#ffd24a", "shield", "right");
        if (active) chip(ctx, W - 76, y + 52, 32, "YOUR TURN", color, "bolt", "right");
      };

      block(idA, nameA, imgA, pa, 160, "#38d6ff");

      // VS badge
      const vg = ctx.createLinearGradient(W / 2 - 40, 430, W / 2 + 40, 510);
      vg.addColorStop(0, "#ff5f8a");
      vg.addColorStop(1, "#a66bff");
      glow(ctx, W / 2, 470, 90, "#ff5f8a", 0.25);
      ctx.fillStyle = "#150b30";
      ctx.beginPath();
      ctx.arc(W / 2, 470, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.arc(W / 2, 470, 40, 0, Math.PI * 2);
      ctx.fill();
      txt(ctx, "VS", W / 2, 471, 32, "#ffffff", "center", "bold");
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(60, 470);
      ctx.lineTo(W / 2 - 58, 470);
      ctx.moveTo(W / 2 + 58, 470);
      ctx.lineTo(W - 60, 470);
      ctx.stroke();

      block(idB, nameB, imgB, pb, 530, "#ffd24a");

      panel(ctx, 48, 800, W - 96, 130, 26, "#ff5f8a");
      iconBadge(ctx, "sword", 96, 865, 28, "#ff5f8a");
      txt(ctx, lastLine || "Battle started!", 144, 840, 21, "#ffffff", "left", "bold", W - 210);
      const turnName = battle.turn === idA ? nameA : nameB;
      chip(ctx, 144, 890, 34, `Next turn: ${turnName}`, "#ffd24a", "bolt", "left");
      return canvas;
    };

    const renderVictory = async (winnerID, loserID, damage, levels) => {
      const [wName, lName, wImg] = await Promise.all([
        getName(winnerID),
        getName(loserID),
        getAvatar(winnerID)
      ]);
      const wp = makePlayer(winnerID);
      const ri = rankInfo(wp.level);
      const { canvas, ctx } = makeCanvas(930, "#ffd24a", "#ff9d2e", "VICTORY!", `${rank(wp.level)}  ·  Level ${wp.level}`);

      // confetti
      const r = seeded(4242);
      const cols = ["#ffd24a", "#ff5f8a", "#38d6ff", "#5dff9a", "#c46bff"];
      for (let i = 0; i < 38; i++) {
        ctx.save();
        ctx.translate(40 + r() * (W - 80), 150 + r() * 330);
        ctx.rotate(r() * 3);
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.75;
        ctx.fillRect(-5, -2.5, 10, 5);
        ctx.restore();
      }

      glow(ctx, W / 2, 330, 240, "#ffd24a", 0.3);
      icon(ctx, "crown", W / 2, 188, 62, "#ffd24a");
      drawAvatar(ctx, wImg, wName, W / 2, 340, 100, "#ffd24a", "#ff9d2e", 9);
      txt(ctx, wName, W / 2, 478, 36, "#ffffff", "center", "bold", W - 120);
      txt(ctx, `defeated ${lName}`, W / 2, 518, 20, "rgba(255,255,255,0.7)", "center", "bold", W - 120);

      const tw = (W - 96 - 20) / 2;
      tile(ctx, 48, 556, tw, 112, "sword", "#ff5f8a", "FINAL HIT", damage);
      tile(ctx, 48 + tw + 20, 556, tw, 112, "crown", ri.color, "LEVEL", wp.level);
      tile(ctx, 48, 688, tw, 112, "coin", "#ffd24a", "COINS", "+50");
      tile(ctx, 48 + tw + 20, 688, tw, 112, "star", "#5dff9a", "XP", "+60");
      if (levels) chip(ctx, W / 2, 842, 44, `LEVEL UP x${levels}!`, "#c46bff", "trophy");
      return canvas;
    };

    const renderTop = async () => {
      const list = Object.entries(DB.players)
        .sort((a, b) => b[1].level * 1000 + b[1].xp - (a[1].level * 1000 + a[1].xp))
        .slice(0, 10);

      if (!list.length) {
        const { canvas, ctx } = makeCanvas(420, "#a66bff", "#ff6fb5", "SHADOW RANKINGS", "Top players");
        txt(ctx, "No players yet. Be the first!", W / 2, 240, 26, "#ffffff", "center", "bold", W - 120);
        return canvas;
      }

      const data = await Promise.all(
        list.map(async ([id]) => ({ id, name: await getName(id), img: await getAvatar(id) }))
      );

      const rest = Math.max(0, list.length - 3);
      const H = rest ? 560 + rest * 80 + 70 : 620;
      const { canvas, ctx } = makeCanvas(H, "#a66bff", "#ff6fb5", "SHADOW RANKINGS", "The legends of the syndicate");

      const medal = [
        ["#ffd24a", "#ff9d2e"],
        ["#dfe6f0", "#9aa8bd"],
        ["#e8a25f", "#b86a2c"]
      ];
      const slotX = [W / 2, 150, W - 150];
      const colH = [130, 100, 80];
      const baseY = 500;

      for (let i = 0; i < Math.min(3, list.length); i++) {
        const d = data[i];
        const pl = list[i][1];
        const ri = rankInfo(pl.level);
        const cx = slotX[i];
        const r = i === 0 ? 62 : 50;
        const top = baseY - colH[i];
        const cy = top - r - 66;
        glow(ctx, cx, cy, r + 70, medal[i][0], 0.22);
        if (i === 0) icon(ctx, "crown", cx, cy - r - 26, 40, "#ffd24a");
        drawAvatar(ctx, d.img, d.name, cx, cy, r, medal[i][0], medal[i][1], 6);
        txt(ctx, d.name, cx, cy + r + 24, 19, "#ffffff", "center", "bold", 190);
        txt(ctx, `Lv.${pl.level}  ${ri.name}`, cx, cy + r + 46, 13, ri.color, "center", "bold", 190);

        const cg = ctx.createLinearGradient(0, top, 0, baseY);
        cg.addColorStop(0, hexA(medal[i][0], 0.55));
        cg.addColorStop(1, hexA(medal[i][1], 0.12));
        ctx.fillStyle = cg;
        rr(ctx, cx - 88, top, 176, colH[i], 18);
        ctx.fill();
        ctx.strokeStyle = hexA(medal[i][0], 0.8);
        ctx.lineWidth = 2;
        rr(ctx, cx - 88, top, 176, colH[i], 18);
        ctx.stroke();
        txt(ctx, i + 1, cx, top + colH[i] / 2, 54, "#ffffff", "center", "bold");
      }

      for (let i = 3; i < list.length; i++) {
        const d = data[i];
        const pl = list[i][1];
        const ri = rankInfo(pl.level);
        const y = 540 + (i - 3) * 80;
        panel(ctx, 48, y, W - 96, 70, 20);
        ctx.fillStyle = hexA(ri.color, 0.18);
        ctx.beginPath();
        ctx.arc(94, y + 35, 22, 0, Math.PI * 2);
        ctx.fill();
        txt(ctx, i + 1, 94, y + 36, 20, "#ffffff", "center", "bold");
        drawAvatar(ctx, d.img, d.name, 160, y + 35, 25, ri.color, ri.color2, 3);
        txt(ctx, d.name, 204, y + 25, 21, "#ffffff", "left", "bold", 270);
        txt(ctx, ri.name, 204, y + 50, 13, ri.color, "left", "bold");
        txt(ctx, `Lv.${pl.level}`, W - 76, y + 25, 22, "#ffffff", "right", "bold");
        txt(ctx, `${pl.wins}W / ${pl.losses}L`, W - 76, y + 50, 14, "rgba(255,255,255,0.65)", "right", "bold");
      }
      return canvas;
    };

    const p = makePlayer(userID);

    /* ───── commands ───── */

    if (action === "help") {
      return sendCard(
        renderHelp,
        "",
        "SHADOW SYNDICATE\n\n" +
          "!shadow profile\n!shadow mission\n!shadow claim\n!shadow battle @mention\n" +
          "!shadow attack | shield | heal | power\n!shadow shop\n!shadow buy potion|crystal\n" +
          "!shadow stats\n!shadow top"
      );
    }

    if (action === "profile" || action === "stats") {
      return sendCard(
        renderProfile,
        "",
        `SHADOW PROFILE\nRank: ${rank(p.level)}\nLevel: ${p.level}\nXP: ${p.xp}/${p.level * 100}\n` +
          `HP: ${p.hp}/${p.maxHp}\nPower: ${p.power}\nDefense: ${p.defense}\nEnergy: ${p.energy}/5\n` +
          `Coins: ${p.coins}\nWins: ${p.wins} | Losses: ${p.losses}\nMissions: ${p.missions}`
      );
    }

    if (action === "mission") {
      if (DB.missions[userID]) {
        return send(
          "⚠️ You already have an active mission!\n" +
            "Use !shadow claim to collect its reward."
        );
      }

      const missions = [
        { name: "Recover the Lost Crystal", risk: 25, reward: 60, xp: 35 },
        { name: "Explore the Dark Forest", risk: 30, reward: 75, xp: 40 },
        { name: "Infiltrate the Secret Base", risk: 40, reward: 100, xp: 55 },
        { name: "Hunt the Phantom", risk: 45, reward: 120, xp: 65 },
        { name: "Steal the Shadow Core", risk: 50, reward: 150, xp: 80 }
      ];

      const m = missions[Math.floor(Math.random() * missions.length)];
      const success = Math.random() * 100 >= m.risk;

      DB.missions[userID] = {
        ...m,
        success,
        completed: false
      };

      return sendCard(
        () => renderMission(m),
        "",
        `🕵️ Mission: ${m.name}\n⚠️ Failure chance: ${m.risk}%\n🪙 Reward: ${m.reward} coins\n` +
          `✨ XP: ${m.xp}\n\nCollect the result: !shadow claim`
      );
    }

    if (action === "claim") {
      const m = DB.missions[userID];

      if (!m) return send("❌ No active mission! Use !shadow mission");

      delete DB.missions[userID];
      p.missions++;

      if (m.success) {
        p.coins += m.reward;
        const levels = addXP(p, m.xp);

        return sendCard(
          () => renderClaim(m, true, 0, levels),
          "",
          `✅ MISSION SUCCESS\n📜 ${m.name}\n🪙 +${m.reward} coins\n✨ +${m.xp} XP\n` +
            `⭐ Level: ${p.level}` +
            (levels ? `\n🎉 Level ups: ${levels}` : "")
        );
      }

      const loss = Math.min(p.coins, 20);
      p.coins -= loss;

      return sendCard(
        () => renderClaim(m, false, loss, 0),
        "",
        `❌ MISSION FAILED\n📜 ${m.name}\n🪙 Lost: ${loss} coins\n🌑 The shadows defeated you.`
      );
    }

    if (action === "shop") {
      return sendCard(
        renderShop,
        "",
        "🛍️ SHADOW SHOP\n\n🧪 Potion — 30 coins (Restores 40 HP)\n!shadow buy potion\n\n" +
          "⚡ Energy Crystal — 50 coins (Restores 2 energy)\n!shadow buy crystal"
      );
    }

    if (action === "buy") {
      const item = String(args[1] || "").toLowerCase();

      if (item === "potion") {
        if (p.coins < 30) return send("❌ You need 30 coins!");

        if (p.hp >= p.maxHp) return send("❤️ Your HP is already full!");

        p.coins -= 30;
        p.hp = Math.min(p.maxHp, p.hp + 40);

        return send(
          `🧪 Potion used!\n❤️ HP: ${p.hp}/${p.maxHp}\n🪙 Coins: ${p.coins}`
        );
      }

      if (item === "crystal") {
        if (p.coins < 50) return send("❌ You need 50 coins!");

        if (p.energy >= 5) return send("⚡ Your energy is already full!");

        p.coins -= 50;
        p.energy = Math.min(5, p.energy + 2);

        return send(
          `🔮 Energy restored!\n⚡ Energy: ${p.energy}/5\n🪙 Coins: ${p.coins}`
        );
      }

      return send("Choose an item: !shadow buy potion OR !shadow buy crystal");
    }

    if (action === "battle") {
      const opponentID = getMention();

      if (!opponentID) {
        return send("⚔️ Mention a player!\nExample: !shadow battle @friend");
      }

      if (opponentID === userID) {
        return send("❌ You cannot battle yourself!");
      }

      if (DB.battles[userID] || DB.battles[opponentID]) {
        return send("⚠️ One of these players is already in a battle!");
      }

      const enemy = makePlayer(opponentID);

      if (p.hp <= 0 || enemy.hp <= 0) {
        return send("❤️ A player has no HP! Use a potion or wait until healed.");
      }

      const battle = {
        a: userID,
        b: opponentID,
        hp: { [userID]: p.hp, [opponentID]: enemy.hp },
        turn: userID,
        shield: {},
        usedPower: {},
        threadID
      };

      DB.battles[userID] = battle;
      DB.battles[opponentID] = battle;

      return sendCard(
        () => renderArena(battle, "Challenger attacks first!"),
        "⚡ Actions: !shadow attack | shield | heal | power",
        "⚔️ BATTLE ARENA\n\n" +
          `🗡️ Challenger: ${userID}\n👹 Opponent: ${opponentID}\n\n` +
          "Challenger attacks first!\n!shadow attack | shield | heal | power"
      );
    }

    if (["attack", "shield", "heal", "power"].includes(action)) {
      const battle = DB.battles[userID];

      if (!battle || battle.threadID !== threadID) {
        return send("❌ You are not in a battle! Use !shadow battle @mention");
      }

      if (battle.turn !== userID) {
        return send("⏳ Wait for your opponent's turn!");
      }

      const enemyID = battle.a === userID ? battle.b : battle.a;
      const own = makePlayer(userID);
      const enemy = makePlayer(enemyID);
      const myName = await getName(userID);

      if (action === "shield") {
        battle.shield[userID] = true;
        battle.turn = enemyID;

        return sendCard(
          () => renderArena(battle, `${myName} raised a shield!`),
          "",
          `🛡️ ${myName} raised a shield!\nNext turn: ${enemyID}`
        );
      }

      if (action === "heal") {
        if (own.coins < 15) return send("❌ Healing costs 15 coins!");

        own.coins -= 15;
        battle.hp[userID] = Math.min(
          own.maxHp,
          battle.hp[userID] + 25
        );

        battle.turn = enemyID;

        return sendCard(
          () => renderArena(battle, `${myName} restored 25 HP! (${own.coins} coins left)`),
          "",
          `💚 ${myName} restored HP!\n❤️ HP: ${battle.hp[userID]}\n🪙 Coins left: ${own.coins}`
        );
      }

      let damage;

      if (action === "power") {
        if (own.energy < 1) return send("🔮 Not enough energy! Buy a crystal.");
        if (battle.usedPower[userID]) {
          return send("⚠️ Special Power can only be used once per battle!");
        }

        own.energy--;
        battle.usedPower[userID] = true;
        damage = own.power * 2 + Math.floor(Math.random() * 10);
      } else {
        damage = own.power + Math.floor(Math.random() * 8);
      }

      if (battle.shield[enemyID]) {
        damage = Math.max(1, Math.floor(damage * 0.4));
        delete battle.shield[enemyID];
      } else {
        damage = Math.max(1, damage - enemy.defense);
      }

      battle.hp[enemyID] = Math.max(0, battle.hp[enemyID] - damage);
      battle.turn = enemyID;

      if (battle.hp[enemyID] <= 0) {
        own.wins++;
        enemy.losses++;
        own.coins += 50;
        const levels = addXP(own, 60);

        delete DB.battles[battle.a];
        delete DB.battles[battle.b];

        own.hp = Math.max(1, Math.min(own.maxHp, battle.hp[userID]));
        enemy.hp = Math.max(1, Math.min(enemy.maxHp, battle.hp[enemyID]));

        return sendCard(
          () => renderVictory(userID, enemyID, damage, levels),
          "",
          "🏆 BATTLE WON\n\n" +
            `⚔️ Winner: ${myName}\n💥 Damage: ${damage}\n🪙 +50 coins\n✨ +60 XP\n` +
            `⭐ Level: ${own.level}` +
            (levels ? `\n🎉 Level ups: ${levels}` : "")
        );
      }

      const label = action === "power" ? "SPECIAL POWER" : "ATTACK";
      return sendCard(
        () => renderArena(battle, `${label}! ${myName} dealt ${damage} damage!`),
        "",
        `💥 ${label}!\n🗡️ ${myName} dealt ${damage} damage!\n` +
          `❤️ Your HP: ${battle.hp[userID]}\n👹 Enemy HP: ${battle.hp[enemyID]}\n⏳ Next turn: ${enemyID}`
      );
    }

    if (action === "top" || action === "leaderboard") {
      const list = Object.entries(DB.players)
        .sort((a, b) => b[1].level * 1000 + b[1].xp - (a[1].level * 1000 + a[1].xp))
        .slice(0, 10);
      const fallback = list.length
        ? list.map((item, i) => `${i + 1}. ${item[0]} | Lv.${item[1].level} | ${rank(item[1].level)}`).join("\n")
        : "No players yet.";
      return sendCard(renderTop, "", "🏆 SHADOW RANKINGS\n\n" + fallback);
    }

    return send("❓ Unknown command! Use !shadow help");
  }
};
