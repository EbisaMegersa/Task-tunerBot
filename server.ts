import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Markup } from "telegraf";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const ADMIN_ID = 2022805638;

// --- Database Setup ---
const db = new Database("bot_users.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertUser = db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)");
const getUserCount = db.prepare("SELECT COUNT(*) as count FROM users");

// --- Bot Setup ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing in environment variables!");
}

const bot = token ? new Telegraf(token) : null;

if (bot) {
  // Middleware to track users
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      insertUser.run(ctx.from.id, ctx.from.username || "anonymous");
    }
    return next();
  });

  // Main menu logic
  const getMainMenu = (userId: number) => {
    const buttons = [
      [Markup.button.text("📱 Open App"), Markup.button.text("💰 Balance")],
      [Markup.button.text("🎁 Daily Reward"), Markup.button.text("ℹ️ Help")]
    ];

    if (userId === ADMIN_ID) {
      buttons.push([Markup.button.text("🛠 Admin Panel")]);
    }

    return Markup.keyboard(buttons).resize();
  };

  bot.start((ctx) => {
    ctx.reply(
      `👋 Welcome to *TASK TUNER*\!\n\nEarn points by completing simple tasks\. Click the button below to start\.`,
      {
        parse_mode: 'MarkdownV2',
        ...getMainMenu(ctx.from.id)
      }
    );
  });

  // Admin Panel Handler
  bot.hears("🛠 Admin Panel", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.reply("🚫 Access Denied: Administrator Only");
    }

    const { count } = getUserCount.get() as { count: number };
    
    ctx.reply(
      `📊 *ADMIN DASHBOARD*\n\n` +
      `👥 Total Users: *${count}*\n` +
      `📅 System Status: *Online*\n\n` +
      `Select an action:`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([
          [Markup.button.text("📊 User Stats"), Markup.button.text("📢 Broadcast")],
          [Markup.button.text("🔙 Back to Main Menu")]
        ]).resize()
      }
    );
  });

  bot.hears("🔙 Back to Main Menu", (ctx) => {
    ctx.reply("Returning to main menu...", getMainMenu(ctx.from.id));
  });

  bot.hears("💰 Balance", (ctx) => {
    ctx.reply("💎 Your current balance is available in the Web App!");
  });

  bot.catch((err: any, ctx: any) => {
    console.error(`Telegraf error for ${ctx.updateType}:`, err);
  });

  // Launch Bot
  bot.launch().then(() => {
    console.log("Telegram Bot started successfully");
  }).catch((err) => {
    console.error("Failed to start Telegram Bot:", err);
  });
}

// --- Express/Vite Setup ---
async function startServer() {
  const app = express();

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botActive: !!bot });
  });

  app.get("/api/admin/stats", (req, res) => {
    try {
      const { count } = getUserCount.get() as { count: number };
      res.json({ totalUsers: count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Development vs Production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Admin ID allowed: ${ADMIN_ID}`);
  });
}

startServer();

// Graceful stop
process.once("SIGINT", () => { if (bot) bot.stop("SIGINT"); });
process.once("SIGTERM", () => { if (bot) bot.stop("SIGTERM"); });
