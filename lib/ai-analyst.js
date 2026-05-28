var https = require("https");
var http = require("http");
var fs = require("fs");
var path = require("path");

var HISTORY_FILE = path.join(__dirname, "..", "data", "history.json");

function callLLM(prompt, config) {
  var apiKey = config.apiKey, baseUrl = config.baseUrl, model = config.model;
  var url = new URL(baseUrl);
  var isHTTPS = url.protocol === "https:";
  var lib = isHTTPS ? https : http;
  var body = JSON.stringify({
    model: model,
    messages: [
      { role: "system", content: "你是一个专业的QDII基金投资助手，拥有记忆能力。你会根据历史推荐记录和市场变化给出越来越精准的建议。请用简洁的中文给出分析和建议，控制在200字以内。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2048
  });
  return new Promise(function(resolve, reject) {
    var req = lib.request({
      hostname: url.hostname, port: url.port || (isHTTPS ? 443 : 80),
      path: url.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "Content-Length": Buffer.byteLength(body) },
      timeout: 60000
    }, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        try {
          var json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            var msg = json.choices[0].message;
            var text = msg.content || msg.reasoning_content || "";
            if (text.length > 0) {
              resolve(text.trim());
            } else {
              reject(new Error("LLM returned empty content"));
            }
          } else if (json.error) {
            reject(new Error("LLM API error: " + (json.error.message || JSON.stringify(json.error))));
          } else {
            reject(new Error("Unexpected response"));
          }
        } catch(e) { reject(new Error("Parse error: " + e.message)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("LLM timeout (60s)")); });
    req.write(body);
    req.end();
  });
}

function generateCommentary(result, llmConfig) {
  var prompt = buildPrompt(result);
  return callLLM(prompt, llmConfig).then(function(text) {
    return text;
  }).catch(function(err) {
    console.error("[AI] error: " + err.message);
    return "";
  });
}

function buildPrompt(result) {
  var lines = [];
  lines.push("今天是" + result.date + "，我有" + result.budget + "元QDII基金定投预算。");
  lines.push("使用的分配策略是：" + result.strategyName + "。");
  lines.push("");

  if (result.allocations && result.allocations.length > 0) {
    lines.push("今日分配方案：");
    for (var i=0;i<result.allocations.length;i++) {
      var f = result.allocations[i];
      var extra = "";
      if (f.reason) extra = "，评分理由：" + f.reason;
      lines.push("- " + f.name + "(" + f.code + ")：限购" + f.dailyLimit + "元，实际买入" + f.allocated + "元，管理费率" + f.feeRate + "%" + extra);
    }
  }
  if (result.suspended && result.suspended.length > 0) {
    lines.push("");
    lines.push("今日跳过的基金（不可买）：");
    for (var j=0;j<result.suspended.length;j++) {
      var sf = result.suspended[j];
      var reason = sf._purchaseRawStatus || (sf.status==="suspended"?"暂停申购":"限额" + sf.dailyLimit + "元");
      lines.push("- " + sf.name + "(" + sf.code + ")：" + reason);
    }
  }

  // 加入历史上下文
  var historyContext = loadHistoryForAI();
  if (historyContext) {
    lines.push("");
    lines.push(historyContext);
  }

  lines.push("");
  lines.push("请简要点评今日的分配方案，分析当前QDII基金限购形势，并给出一两句投资建议。如果我有历史推荐记录，请结合历史表现给出更精准的建议。");
  return lines.join("\n");
}

function loadHistoryForAI() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return null;
    var data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    if (!data.records || data.records.length === 0) return null;

    var recent = data.records.slice(-5); // 最近5次
    var lines = ["历史推荐记录（最近" + recent.length + "次）："];

    for (var i = 0; i < recent.length; i++) {
      var rec = recent[i];
      var allocs = rec.allocations ? rec.allocations.map(function(a) {
        var perf = "";
        if (a.followUp5dReturn !== null && a.followUp5dReturn !== undefined) {
          perf = "，后续5日收益" + a.followUp5dReturn + "%";
        }
        return a.name + "(" + a.allocated + "元" + perf + ")";
      }).join("、") : "无";
      lines.push("- " + rec.date + "：总投入" + rec.totalAllocated + "元，买入" + allocs);
    }

    // 统计热门基金
    var freq = {};
    for (var j = 0; j < data.records.length; j++) {
      var r = data.records[j];
      if (!r.allocations) continue;
      for (var k = 0; k < r.allocations.length; k++) {
        var a = r.allocations[k];
        freq[a.code] = (freq[a.code] || 0) + 1;
      }
    }
    var sorted = Object.entries(freq).sort(function(a,b) { return b[1] - a[1]; }).slice(0, 3);
    if (sorted.length > 0) {
      lines.push("最常推荐的基金：" + sorted.map(function(e) { return e[0] + "(" + e[1] + "次)"; }).join("、"));
    }

    return lines.join("\n");
  } catch (err) {
    return null;
  }
}

module.exports = { generateCommentary: generateCommentary, callLLM: callLLM };