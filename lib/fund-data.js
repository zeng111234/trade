const https = require("https");
const http = require("http");

function httpGet(url, timeoutMs) {
  if (!timeoutMs) timeoutMs = 15000;
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;
    var req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://fund.eastmoney.com/" }, timeout: timeoutMs }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("HTTP timeout (" + timeoutMs + "ms)")); });
  });
}

async function getFundNavHistory(fundCode, days) {
  if (!days) days = 30;
  var pageSize = 20; // API max per page
  var pages = Math.ceil(days / pageSize);
  var allRecords = [];

  for (var page = 1; page <= pages; page++) {
    var url = "https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + fundCode + "&pageIndex=" + page + "&pageSize=" + pageSize;
    try {
      var raw = await httpGet(url, 10000);
      var json = JSON.parse(raw);
      if (!json.Data || !json.Data.LSJZList || json.Data.LSJZList.length === 0) break;
      var records = json.Data.LSJZList.map(function(item) {
        return { date: item.FSRQ, nav: parseFloat(item.DWJZ), accNav: parseFloat(item.LJJZ), changeRate: item.JZZZL ? parseFloat(item.JZZZL) : 0 };
      });
      allRecords = allRecords.concat(records);
      if (json.Data.LSJZList.length < pageSize) break; // no more pages
      if (page < pages) await new Promise(function(r) { setTimeout(r, 200); }); // rate limit
    } catch (err) {
      console.error("[data] fund " + fundCode + " page " + page + " error: " + err.message);
      break;
    }
  }

  if (allRecords.length === 0) {
    console.warn("[data] fund " + fundCode + ": no data");
  }
  // Reverse to chronological order and trim to requested days
  return allRecords.reverse().slice(-days);
}

function calcIndicators(navHistory) {
  if (!navHistory || navHistory.length < 2) { return { error: "insufficient data" }; }
  var navs = navHistory.map(function(d) { return d.nav; });
  var latest = navs[navs.length - 1];
  var ma5 = navs.length >= 5 ? navs.slice(-5).reduce(function(a,b){return a+b},0) / 5 : navs.reduce(function(a,b){return a+b},0) / navs.length;
  var ma10 = navs.length >= 10 ? navs.slice(-10).reduce(function(a,b){return a+b},0) / 10 : ma5;
  var maDeviation = ((latest - ma10) / ma10) * 100;
  var recent5Change = navs.length >= 5 ? ((latest - navs[navs.length-5]) / navs[navs.length-5]) * 100 : 0;
  var recent10Change = navs.length >= 10 ? ((latest - navs[navs.length-10]) / navs[navs.length-10]) * 100 : recent5Change;
  var recentHigh = Math.max.apply(null, navs.slice(-10));
  var drawdown = ((latest - recentHigh) / recentHigh) * 100;
  var returns = [];
  for (var i = Math.max(0, navs.length - 10); i < navs.length; i++) {
    if (i > 0) returns.push((navs[i] - navs[i-1]) / navs[i-1]);
  }
  var avgReturn = returns.reduce(function(a,b){return a+b},0) / (returns.length || 1);
  var variance = returns.reduce(function(sum,r){return sum + Math.pow(r - avgReturn, 2)},0) / (returns.length || 1);
  var volatility = Math.sqrt(variance) * 100;
  function r2(n) { return Math.round(n*100)/100; }
  return { latest: r2(latest), ma5: r2(ma5), ma10: r2(ma10), maDeviation: r2(maDeviation), recent5Change: r2(recent5Change), recent10Change: r2(recent10Change), drawdown: r2(drawdown), volatility: r2(volatility), dataPoints: navs.length };
}

async function getFundPurchaseInfo(fundCode) {
  var url = "https://fundmobapi.eastmoney.com/FundMApi/FundBasicInformation.ashx?FCODE=" + fundCode + "&deviceid=wap&version=5.8.0&product=EFund&plat=Wap";
  try {
    var raw = await httpGet(url, 3000);
    var json = JSON.parse(raw);
    var data = json.Datas || json;
    if (!data || !data.SGZT) return { status: "unknown", limit: 100, minPurchase: 10 };
    var status = "active";
    var limit = 100;
    var minPurchase = 10;
    var sgzt = data.SGZT || "";
    var isBuy = data.ISBUY === "1" || data.BUY === true;
    if (data.MINSG) minPurchase = parseInt(data.MINSG) || 10;
    if (data.MAXSG && data.MAXSG !== "" && data.MAXSG !== "0") {
      limit = parseInt(data.MAXSG) || 100;
    }
    var suspended = sgzt.indexOf("\u6682\u505c") >= 0 || sgzt.indexOf("\u5c01\u95ed") >= 0;
    var limited = sgzt.indexOf("\u9650\u5927\u989d") >= 0 || sgzt.indexOf("\u9650\u5236") >= 0;
    var opened = sgzt.indexOf("\u5f00\u653e") >= 0;
    if (!isBuy || suspended) {
      status = "suspended";
    } else if (limited) {
      status = "limited";
    } else if (opened) {
      status = "active";
    }
    return { status: status, limit: limit, minPurchase: minPurchase, rawStatus: sgzt };
  } catch (err) {
    console.error("[data] getFundPurchaseInfo error for " + fundCode + ":", err.message);
    return { status: "unknown", limit: 100, minPurchase: 10 };
  }
}

module.exports = { getFundNavHistory: getFundNavHistory, calcIndicators: calcIndicators, getFundPurchaseInfo: getFundPurchaseInfo };