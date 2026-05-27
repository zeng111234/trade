var nodemailer = require("nodemailer");

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host, port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass }
  });
}

function escapeHtml(str) {
  var amp = String.fromCharCode(38) + "amp;";
  var lt = String.fromCharCode(38) + "lt;";
  var gt = String.fromCharCode(38) + "gt;";
  var quot = String.fromCharCode(38) + "quot;";
  return str.replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
}

function buildEmailHtml(textContent, aiCommentary) {
  var textHtml = escapeHtml(textContent).replace(/\n/g, "<br>").replace(/ /g, String.fromCharCode(38) + "nbsp;");
  var aiHtml = aiCommentary
    ? '<div style="margin-top:20px;padding:15px;background:#f0f7ff;border-left:4px solid #4a90d9;border-radius:4px;"><strong>AI\u70b9\u8bc4\uff1a</strong><br><p style="margin:8px 0 0 0;line-height:1.6;">' + escapeHtml(aiCommentary).replace(/\n/g, "<br>") + "</p></div>"
    : "";
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:Microsoft YaHei,PingFang SC,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;\">"
    + '<div style="background:#1a1a2e;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;"><h2 style="margin:0;">QDII\u57fa\u91d1\u6bcf\u65e5\u6295\u8d44\u8ba1\u5212</h2></div>'
    + '<div style="background:#fafafa;padding:20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">'
    + '<pre style="font-family:Courier New,monospace;font-size:13px;line-height:1.6;background:#fff;padding:15px;border-radius:4px;border:1px solid #eee;overflow-x:auto;white-space:pre-wrap;">' + textHtml + "</pre>"
    + aiHtml
    + '<div style="margin-top:20px;padding-top:15px;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center;">\u6b64\u90ae\u4ef6\u7531 QDII\u57fa\u91d1\u5206\u914d\u5668 \u81ea\u52a8\u751f\u6210</div></div></body></html>';
}

function sendEmail(options, smtpConfig) {
  var transporter = createTransporter(smtpConfig);
  var mailOptions = {
    from: '"QDII\u5b9a\u6295\u52a9\u624b" <' + smtpConfig.user + ">",
    to: options.to,
    subject: options.subject || "QDII\u6295\u8d44\u8ba1\u5212",
    text: options.textContent,
    html: buildEmailHtml(options.textContent, options.aiCommentary)
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