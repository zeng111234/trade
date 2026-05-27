require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { allocate, formatResult, Strategy } = require("./lib/allocator");
const { allocateDynamic, formatDynamicResult } = require("./lib/dynamic-strategy");
const { generateCommentary } = require("./lib/ai-analyst");
const { sendEmail } = require("./lib/mailer");

const FUNDS_FILE = path.join(__dirname, "data", "funds.json");
const STRATEGY_MAP = {
  "equal": Strategy.EQUAL,
  "low_fee": Strategy.LOW_FEE,
  "scarce": Strategy.SCARCE_FIRST,
  "dynamic": "dynamic"
};

function loadFunds() {
  if (!fs.existsSync(FUNDS_FILE)) { console.error("[error] funds.json not found"); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(FUNDS_FILE, "utf-8"));
  if (!data.funds || data.funds.length === 0) { console.error("[error] funds pool empty"); process.exit(1); }
  return data;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, strategy: null, budget: null };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run": opts.dryRun = true; break;
      case "--strategy": opts.strategy = args[++i]; break;
      case "--budget": opts.budget = parseFloat(args[++i]); break;
      case "--help":
        console.log("QDII Fund Allocator");
        console.log("  --dry-run              \u8fd0\u884c\u6d4b\u8bd5\u6a21\u5f0f");
        console.log("  --strategy <name>      \u7b56\u7565: equal|low_fee|scarce|dynamic");
        console.log("  --budget <amount>      \u6bcf\u65e5\u9884\u7b97");
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  console.log("========================================");
  console.log("  QDII Fund Daily Allocator");
  console.log("========================================");
  console.log("");

  const opts = parseArgs();
  console.log("[1/4] \u52a0\u8f7d\u57fa\u91d1\u6c60...");
  const data = loadFunds();
  const funds = data.funds;
  const config = data.config || {};

  const budget = opts.budget || config.defaultBudget || 20;
  const strategyKey = opts.strategy || config.defaultStrategy || "scarce";
  const strategy = STRATEGY_MAP[strategyKey] || Strategy.SCARCE_FIRST;

  console.log("  " + funds.length + " funds, budget=" + budget + ", strategy=" + strategyKey);
  console.log("");

  console.log("[2/4] \u6267\u884c\u9884\u7b97\u5206\u914d...");
  let result, textContent;
  if (strategy === "dynamic") {
    result = await allocateDynamic(budget, funds);
    textContent = formatDynamicResult(result);
  } else {
    result = allocate(budget, funds, strategy);
    textContent = formatResult(result);
  }
  console.log(textContent);
  console.log("");

  let aiCommentary = "";
  const llmApiKey = process.env.LLM_API_KEY;
  const llmBaseUrl = process.env.LLM_BASE_URL;
  const llmModel = process.env.LLM_MODEL;

  if (llmApiKey && llmBaseUrl && llmModel) {
    console.log("[3/4] AI\u5206\u6790...");
    aiCommentary = await generateCommentary(result, { apiKey: llmApiKey, baseUrl: llmBaseUrl, model: llmModel });
    console.log("AI: " + aiCommentary);
  } else {
    console.log("[3/4] AI skipped (no LLM_API_KEY)");
  }
  console.log("");

  if (opts.dryRun) {
    console.log("[4/4] dry-run, skip email");
    console.log("");
    console.log("--- preview ---");
    console.log(textContent);
    if (aiCommentary) { console.log(""); console.log("AI: " + aiCommentary); }
    console.log("--- end ---");
  } else {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "465");
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const mailTo = process.env.MAIL_TO;
    if (!smtpHost || !smtpUser || !smtpPass || !mailTo) {
      console.log("[4/4] email skipped (SMTP not configured)");
    } else {
      console.log("[4/4] \u53d1\u9001\u90ae\u4ef6...");
      const smtpConfig = { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass };
      const success = await sendEmail({ to: mailTo, subject: "QDII\u6295\u8d44\u8ba1\u5212 " + result.date, textContent, aiCommentary }, smtpConfig);
      if (!success) { console.error("[error] email failed"); process.exit(1); }
    }
  }
  console.log("");
  console.log("\u5b8c\u6210\uff01");
}

main().catch(err => { console.error("[fatal]", err); process.exit(1); });