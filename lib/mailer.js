var nodemailer = require("nodemailer");

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host, port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass }
  });
}

function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildEmailHtml(textContent, aiCommentary, result) {
  var dateStr = result ? result.date : new Date().toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"});
  var budgetStr = result ? result.budget : "20";
  var strategyStr = result ? result.strategyName : "";

  var rows = "";
  if (result && result.allocations) {
    for (var i=0; i<result.allocations.length; i++) {
      var f = result.allocations[i];
      var change = "";
      if (f.indicators && !f.indicators.error) {
        var c = f.indicators.recent5Change;
        change = (c >= 0 ? "+" : "") + c + "%";
      }
      var changeColor = (f.indicators && !f.indicators.error && f.indicators.recent5Change < 0) ? "#e74c3c" : "#27ae60";
      rows += "<tr>"
        + "<td style=\"padding:10px 12px;border-bottom:1px solid #eee;font-size:14px\">" + esc(f.name) + "<br><span style=\"color:#999;font-size:12px\">" + f.code + "</span></td>"
        + "<td style=\"padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#333\">" + f.score + "</td>"
        + "<td style=\"padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:" + changeColor + "\">" + change + "</td>"
        + "<td style=\"padding:10px 12px;border-bottom:1px solid #eee;text-align:center\">" + f.dailyLimit + "\u5143</td>"
        + "<td style=\"padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;font-size:16px;color:#2c3e50\">" + f.allocated + "\u5143</td>"
        + "</tr>";
    }
  }

  var tableHeader = "";
  if (result && result.strategy === "dynamic") {
    tableHeader = "<tr style=\"background:#f8f9fa\">"
      + "<th style=\"padding:12px;text-align:left;font-size:13px;color:#666\">\u57fa\u91d1</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">\u5f97\u5206</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">5\u65e5\u6da8\u8dcc</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">\u9650\u8d2d</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">\u4e70\u5165</th>"
      + "</tr>";
  } else {
    tableHeader = "<tr style=\"background:#f8f9fa\">"
      + "<th style=\"padding:12px;text-align:left;font-size:13px;color:#666\">\u57fa\u91d1</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">-</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">-</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">\u9650\u8d2d</th>"
      + "<th style=\"padding:12px;text-align:center;font-size:13px;color:#666\">\u4e70\u5165</th>"
      + "</tr>";
  }

  var totalAlloc = result ? result.totalAllocated : 0;
  var leftover = result ? result.leftover : 0;

  var aiSection = "";
  if (aiCommentary && aiCommentary.length > 5 && !aiCommentary.startsWith("[AI")) {
    aiSection = "<div style=\"margin-top:24px;padding:16px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:12px;color:#fff\">"
      + "<div style=\"font-size:14px;font-weight:bold;margin-bottom:8px\">\ud83e\udd16 AI\u70b9\u8bc4</div>"
      + "<p style=\"margin:0;line-height:1.8;font-size:14px;opacity:0.95\">" + esc(aiCommentary) + "</p>"
      + "</div>";
  }

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"margin:0;padding:0;background:#f0f2f5\">"
    + "<div style=\"max-width:600px;margin:0 auto;padding:20px\">"
    + "<div style=\"background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)\">"
    + "<div style=\"background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 24px;text-align:center\">"
    + "<div style=\"font-size:28px;margin-bottom:8px\">\ud83d\udcca</div>"
    + "<h1 style=\"margin:0;color:#fff;font-size:20px;font-weight:600\">QDII\u6bcf\u65e5\u6295\u8d44\u8ba1\u5212</h1>"
    + "<p style=\"margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px\">" + dateStr + "</p>"
    + "</div>"
    + "<div style=\"padding:24px\">"
    + "<div style=\"display:flex;justify-content:space-between;margin-bottom:20px\">"
    + "<div style=\"text-align:center;flex:1;padding:12px;background:#f8f9fa;border-radius:10px;margin-right:8px\">"
    + "<div style=\"font-size:12px;color:#999\">\u9884\u7b97</div>"
    + "<div style=\"font-size:24px;font-weight:bold;color:#2c3e50\">" + budgetStr + "\u5143</div></div>"
    + "<div style=\"text-align:center;flex:1;padding:12px;background:#f8f9fa;border-radius:10px;margin-left:8px\">"
    + "<div style=\"font-size:12px;color:#999\">\u7b56\u7565</div>"
    + "<div style=\"font-size:14px;font-weight:bold;color:#2c3e50\">" + esc(strategyStr) + "</div></div>"
    + "</div>"
    + "<table style=\"width:100%;border-collapse:collapse;margin:16px 0\">"
    + tableHeader + rows + "</table>"
    + "<div style=\"display:flex;justify-content:space-between;padding:16px 0;border-top:2px solid #f0f2f5\">"
    + "<div style=\"font-size:14px;color:#666\">\u5408\u8ba1\u4e70\u5165</div>"
    + "<div style=\"font-size:20px;font-weight:bold;color:#27ae60\">" + totalAlloc + "\u5143</div>"
    + "</div>"
    + (leftover > 0 ? "<div style=\"font-size:12px;color:#999;text-align:right\">\u5269\u4f59 " + leftover + "\u5143</div>" : "")
    + aiSection
    + "</div>"
    + "<div style=\"text-align:center;padding:16px;font-size:12px;color:#999\">\u6b64\u90ae\u4ef6\u7531 QDII\u57fa\u91d1\u5206\u914d\u5668 \u81ea\u52a8\u751f\u6210</div>"
    + "</div></body></html>";
}

function sendEmail(options, smtpConfig) {
  var transporter = createTransporter(smtpConfig);
  var mailOptions = {
    from: '"QDII" <' + smtpConfig.user + ">",
    to: options.to,
    subject: options.subject || "QDII",
    text: options.textContent,
    html: buildEmailHtml(options.textContent, options.aiCommentary, options.result)
  };
  return transporter.sendMail(mailOptions).then(function(info) {
    console.log("[mail] sent: " + info.messageId);
    return true;
  }).catch(function(err) {
    console.error("[mail] failed: " + err.message);
    return false;
  });
}

module.exports = { sendEmail: sendEmail, buildEmailHtml: buildEmailHtml };