var https = require("https");
var http = require("http");

function callLLM(prompt, config) {
  var apiKey = config.apiKey, baseUrl = config.baseUrl, model = config.model;
  var url = new URL(baseUrl);
  var isHTTPS = url.protocol === "https:";
  var lib = isHTTPS ? https : http;
  var body = JSON.stringify({
    model: model,
    messages: [
      { role: "system", content: "\u4f60\u662f\u4e00\u4e2a\u4e13\u4e1a\u7684QDII\u57fa\u91d1\u6295\u8d44\u52a9\u624b\u3002\u8bf7\u7528\u7b80\u6d01\u7684\u4e2d\u6587\u7ed9\u51fa\u5206\u6790\u548c\u5efa\u8bae\uff0c\u63a7\u5236\u5728150\u5b57\u4ee5\u5185\u3002" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7, max_tokens: 300
  });
  return new Promise(function(resolve, reject) {
    var req = lib.request({
      hostname: url.hostname, port: url.port || (isHTTPS ? 443 : 80),
      path: url.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "Content-Length": Buffer.byteLength(body) },
      timeout: 30000
    }, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        try {
          var json = JSON.parse(data);
          if (json.choices && json.choices[0]) resolve(json.choices[0].message.content.trim());
          else if (json.error) reject(new Error("LLM API error: " + (json.error.message || JSON.stringify(json.error))));
          else reject(new Error("Unexpected LLM response: " + data.substring(0, 200)));
        } catch(e) { reject(new Error("Failed to parse: " + e.message)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("LLM timeout")); });
    req.write(body);
    req.end();
  });
}

function generateCommentary(result, llmConfig) {
  var prompt = buildPrompt(result);
  return callLLM(prompt, llmConfig).catch(function(err) {
    console.error("[AI] error: " + err.message);
    return "[AI unavailable: " + err.message + "]";
  });
}

function buildPrompt(result) {
  var lines = [];
  lines.push("\u4eca\u5929\u662f" + result.date + "\uff0c\u6211\u6709" + result.budget + "\u5143QDII\u57fa\u91d1\u5b9a\u6295\u9884\u7b97\u3002");
  lines.push("\u4f7f\u7528\u7684\u5206\u914d\u7b56\u7565\u662f\uff1a" + result.strategyName + "\u3002");
  lines.push("");
  if (result.allocations && result.allocations.length > 0) {
    lines.push("\u4eca\u65e5\u5206\u914d\u65b9\u6848\uff1a");
    for (var i=0;i<result.allocations.length;i++) {
      var f = result.allocations[i];
      lines.push("- " + f.name + "(" + f.code + ")\uff1a\u9650\u8d2d" + f.dailyLimit + "\u5143\uff0c\u5b9e\u9645\u4e70\u5165" + f.allocated + "\u5143\uff0c\u7ba1\u7406\u8d39\u7387" + f.feeRate + "%");
    }
  }
  if (result.suspended && result.suspended.length > 0) {
    lines.push("");
    lines.push("\u4eca\u65e5\u8df3\u8fc7\u7684\u57fa\u91d1\uff1a");
    for (var j=0;j<result.suspended.length;j++) {
      var sf = result.suspended[j];
      lines.push("- " + sf.name + "(" + sf.code + ")\uff1a" + (sf.status==="suspended"?"\u6682\u505c\u7533\u8d2d":"\u9650\u989d" + sf.dailyLimit + "\u5143"));
    }
  }
  lines.push("");
  lines.push("\u8bf7\u7b80\u8981\u70b9\u8bc4\u4eca\u65e5\u7684\u5206\u914d\u65b9\u6848\uff0c\u5206\u6790\u5f53\u524dQDII\u57fa\u91d1\u9650\u8d2d\u5f62\u52bf\uff0c\u5e76\u7ed9\u51fa\u4e00\u4e24\u53e5\u6295\u8d44\u5efa\u8bae\u3002");
  return lines.join("\n");
}

module.exports = { generateCommentary: generateCommentary, callLLM: callLLM };