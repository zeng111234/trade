const { getFundNavHistory, calcIndicators } = require("./fund-data");

const WEIGHTS = {
  base: 10, drawdown: 2.0, maDeviation: 1.5,
  recent5Change: -0.8, recent10Change: -0.3, volatility: -0.5,
  suspended: -999
};

function scoreFund(fund, indicators) {
  if (fund.status !== "active" || fund.dailyLimit <= 0) {
    return { score: WEIGHTS.suspended, reason: fund.status === "suspended" ? "\u6682\u505c\u7533\u8d2d" : "\u9650\u989d\u4e3a0", indicators };
  }
  if (indicators.error) {
    return { score: WEIGHTS.base, reason: "\u6570\u636e\u4e0d\u8db3\uff0c\u4f7f\u7528\u57fa\u7840\u8bc4\u5206", indicators };
  }
  let score = WEIGHTS.base;
  const reasons = [];
  const drawdownScore = indicators.drawdown * WEIGHTS.drawdown;
  score += drawdownScore;
  if (drawdownScore > 0) reasons.push("\u56de\u64a4" + indicators.drawdown + "%\u52a0" + round1(drawdownScore) + "\u5206");
  else if (drawdownScore < 0) reasons.push("\u8fd1\u671f\u65b0\u9ad8\u6263" + round1(Math.abs(drawdownScore)) + "\u5206");
  const maScore = indicators.maDeviation * WEIGHTS.maDeviation;
  score += maScore;
  if (maScore > 0) reasons.push("\u4f4e\u4e8eMA10\u52a0" + round1(maScore) + "\u5206");
  else if (maScore < 0) reasons.push("\u9ad8\u4e8eMA10\u6263" + round1(Math.abs(maScore)) + "\u5206");
  const change5Score = indicators.recent5Change * WEIGHTS.recent5Change;
  score += change5Score;
  if (change5Score < -2) reasons.push("5\u65e5\u6da8" + indicators.recent5Change + "%\u6263" + round1(Math.abs(change5Score)) + "\u5206");
  const volScore = indicators.volatility * WEIGHTS.volatility;
  score += volScore;
  if (volScore < -1) reasons.push("\u6ce2\u52a8" + indicators.volatility + "%\u6263" + round1(Math.abs(volScore)) + "\u5206");
  score = Math.max(0.1, score);
  return { score: round2(score), reason: reasons.length > 0 ? reasons.join("\uff0c") : "\u6b63\u5e38\u8bc4\u5206", indicators };
}

async function allocateDynamic(budget, funds, lookbackDays) {
  if (!lookbackDays) lookbackDays = 20;
  console.log("[\u52a8\u6001\u7b56\u7565] \u5f00\u59cb\u83b7\u53d6\u57fa\u91d1K\u7ebf\u6570\u636e...");
  const fundDataPairs = await Promise.all(funds.map(async fund => {
    const history = await getFundNavHistory(fund.code, lookbackDays);
    const indicators = calcIndicators(history);
    return { fund, history, indicators };
  }));
  const scored = fundDataPairs.map(({ fund, indicators }) => {
    const result = scoreFund(fund, indicators);
    return { ...fund, ...result };
  });
  const available = scored.filter(f => f.score > 0);
  const suspended = scored.filter(f => f.score <= 0);
  const allocations = allocateByScore(budget, available);
  const totalAllocated = allocations.reduce((sum, f) => sum + f.allocated, 0);
  return {
    budget, strategy: "dynamic",
    strategyName: "\u52a8\u6001K\u7ebf\u7b56\u7565",
    date: new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
    allocations, suspended,
    totalAllocated: round2(totalAllocated),
    leftover: round2(budget - totalAllocated)
  };
}

function allocateByScore(budget, scoredFunds) {
  if (scoredFunds.length === 0) return [];
  let remaining = budget;
  const result = scoredFunds.map(f => ({ ...f, allocated: 0 }));
  let unsettled = [...result];
  for (let round = 0; round < 5 && unsettled.length > 0 && remaining > 0; round++) {
    const totalScore = unsettled.reduce((sum, f) => sum + f.score, 0);
    if (totalScore <= 0) break;
    const nextUnsettled = [];
    for (const fund of unsettled) {
      if (remaining <= 0) break;
      const share = (fund.score / totalScore) * remaining;
      const allocated = Math.min(share, fund.dailyLimit - fund.allocated, remaining);
      fund.allocated += round2(allocated);
      remaining = round2(remaining - allocated);
      if (fund.allocated < fund.dailyLimit && remaining > 0) nextUnsettled.push(fund);
    }
    unsettled = nextUnsettled;
  }
  return result.filter(f => f.allocated > 0).map(f => ({ ...f, allocated: round2(f.allocated) })).sort(function(a,b) { return b.score - a.score; });
}

function formatDynamicResult(result) {
  const lines = [];
  lines.push("[\u4eca\u65e5QDII\u6295\u8d44\u8ba1\u5212] " + result.date);
  lines.push("");
  lines.push("\u603b\u9884\u7b97\uff1a" + result.budget + "\u5143");
  lines.push("\u7b56\u7565\uff1a" + result.strategyName + "\uff08\u57fa\u4e8e\u8fd1\u671fK\u7ebf\u52a8\u6001\u52a0\u6743\uff09");
  lines.push("");
  if (result.allocations.length > 0) {
    lines.push("\u4e70\u5165\u6e05\u5355\uff1a");
    lines.push("+----------------------------+------+------+----------+--------+");
    lines.push("| \u57fa\u91d1                      | \u5f97\u5206 | 5\u65e5\u6da8\u8dcc | \u9650\u8d2d    | \u4e70\u5165     |");
    lines.push("+----------------------------+------+------+----------+--------+");
    for (const f of result.allocations) {
      const name = (f.name.length > 24 ? f.name.substring(0, 24) + ".." : f.name).padEnd(26);
      const score = String(f.score).padStart(4);
      const change = f.indicators && !f.indicators.error
        ? ((f.indicators.recent5Change >= 0 ? "+" : "") + f.indicators.recent5Change + "%").padStart(7)
        : "    N/A";
      const limit = (f.dailyLimit + "\u5143").padStart(8);
      const alloc = (f.allocated + "\u5143").padStart(6);
      lines.push("| " + name + "| " + score + " | " + change + " | " + limit + " | " + alloc + " |");
    }
    lines.push("+----------------------------+------+------+----------+--------+");
    lines.push("");
    lines.push("\u8bc4\u5206\u8bf4\u660e\uff1a\u5f97\u5206\u8d8a\u9ad8 = \u8fd1\u671f\u8dcc\u5e45\u8d8a\u5927 / \u4f4e\u4e8e\u5747\u7ebf\u8d8a\u6df1 = \u8d8a\u8be5\u591a\u4e70");
  } else {
    lines.push("\u4eca\u65e5\u65e0\u53ef\u7533\u8d2d\u57fa\u91d1");
  }
  if (result.suspended.length > 0) {
    lines.push("");
    lines.push("\u4eca\u65e5\u8df3\u8fc7\uff1a");
    for (const f of result.suspended) {
      lines.push("  - " + f.name + "(" + f.code + ") -> " + f.reason);
    }
  }
  if (result.leftover > 0) { lines.push(""); lines.push("\u5269\u4f59\u672a\u5206\u914d\uff1a" + result.leftover + "\u5143"); }
  lines.push("");
  lines.push("\u5408\u8ba1\u4e70\u5165\uff1a" + result.totalAllocated + "\u5143 / \u9884\u7b97" + result.budget + "\u5143");
  return lines.join("\n");
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { allocateDynamic, formatDynamicResult, scoreFund, WEIGHTS };