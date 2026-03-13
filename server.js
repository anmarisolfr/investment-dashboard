const http = require("http");
const https = require("https");
const url = require("url");

const PORT = 3001;

function fetchYahooSummary(ticker) {
  return new Promise((resolve, reject) => {
    const endpoint = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=summaryDetail`;
    const options = { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } };
    https.get(endpoint, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

function fetchYahoo(ticker) {
  return new Promise((resolve, reject) => {
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    };
    https.get(endpoint, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Error parseando respuesta de Yahoo"));
        }
      });
    }).on("error", reject);
  });
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function calcChange(closes) {
  if (closes.length < 2) return 0;
  const prev = closes[closes.length - 2];
  const curr = closes[closes.length - 1];
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function getSignal(price, ma50, ma100, ma200, rsi) {
  const overMA = [ma50, ma100, ma200].filter(Boolean).every(ma => price > ma);
  const underMA50 = ma50 && price < ma50;
  const underMA200 = ma200 && price < ma200;

  if (rsi >= 70) return "caution";
  if (underMA200) return "caution";
  if (overMA && rsi >= 40 && rsi < 70) return "buy";
  if (underMA50 && rsi > 50) return "wait";
  return "wait";
}

function buildDesc(ticker, price, ma50, ma100, ma200, rsi, signal) {
  const maStatus = (price, ma, label) => {
    if (!ma) return "";
    const pct = (((price - ma) / ma) * 100).toFixed(1);
    return `${pct > 0 ? "Por encima" : "Por debajo"} de ${label} (${pct > 0 ? "+" : ""}${pct}%). `;
  };
  let desc = maStatus(price, ma50, "MA50") + maStatus(price, ma200, "MA200");
  if (rsi <= 30) desc += "RSI en sobreventa. Posible rebote técnico. ";
  else if (rsi >= 70) desc += "RSI en sobrecompra. Riesgo de corrección a corto plazo. ";
  else desc += `RSI en zona ${rsi < 50 ? "neutral-baja" : "neutral-alta"} (${rsi}). `;
  if (signal === "buy") desc += "Perfil técnico favorable para entrada.";
  else if (signal === "caution") desc += "Timing desfavorable. Esperar corrección.";
  else desc += "Sin señal direccional clara. Aguardar confirmación.";
  return desc;
}

function detectLevels(highs, lows, closes, price) {
  const n = closes.length;
  if (n < 30) return null;

  function findLocalMins(arr, window = 5) {
    const mins = [];
    for (let i = window; i < arr.length - window; i++) {
      const val = arr[i];
      if (!val) continue;
      const left  = arr.slice(i - window, i).filter(Boolean);
      const right = arr.slice(i + 1, i + window + 1).filter(Boolean);
      if (left.every(v => v >= val) && right.every(v => v >= val)) {
        mins.push({ idx: i, price: val });
      }
    }
    return mins;
  }

  function findLocalMaxs(arr, window = 5) {
    const maxs = [];
    for (let i = window; i < arr.length - window; i++) {
      const val = arr[i];
      if (!val) continue;
      const left  = arr.slice(i - window, i).filter(Boolean);
      const right = arr.slice(i + 1, i + window + 1).filter(Boolean);
      if (left.every(v => v <= val) && right.every(v => v <= val)) {
        maxs.push({ idx: i, price: val });
      }
    }
    return maxs;
  }

  function clusterLevels(points) {
    if (!points.length) return [];
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const clusters = [];
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = current[current.length - 1];
      if ((sorted[i].price - prev.price) / prev.price < 0.02) {
        current.push(sorted[i]);
      } else {
        clusters.push(current);
        current = [sorted[i]];
      }
    }
    clusters.push(current);
    return clusters;
  }

  function verifyBounce(idx, closes, dir = 'up') {
    const base = closes[idx];
    const lookAhead = closes.slice(idx + 1, idx + 15).filter(Boolean);
    if (!lookAhead.length) return false;
    if (dir === 'up') return lookAhead.some(v => (v - base) / base >= 0.025);
    else return lookAhead.some(v => (base - v) / base >= 0.025);
  }

  const localMins = findLocalMins(lows);
  const localMaxs = findLocalMaxs(highs);
  const validMins = localMins.filter(p => verifyBounce(p.idx, closes, 'up'));
  const validMaxs = localMaxs.filter(p => verifyBounce(p.idx, closes, 'down'));

  const supportClusters = clusterLevels(validMins)
    .filter(c => c.length >= 2)
    .map(c => ({ price: c.reduce((s, p) => s + p.price, 0) / c.length, touches: c.length }))
    .filter(c => c.price < price)
    .sort((a, b) => b.price - a.price);

  const resistanceClusters = clusterLevels(validMaxs)
    .filter(c => c.length >= 2)
    .map(c => ({ price: c.reduce((s, p) => s + p.price, 0) / c.length, touches: c.length }))
    .filter(c => c.price > price)
    .sort((a, b) => a.price - b.price);

  if (!supportClusters.length && !resistanceClusters.length) return null;

  const ZONE = 0.015;
  const support = supportClusters[0] || null;
  const resistance = resistanceClusters[0] || null;

  let position = null;
  if (support && resistance) {
    position = Math.round(((price - support.price) / (resistance.price - support.price)) * 100);
    position = Math.max(0, Math.min(100, position));
  }

  let explanation = '';
  if (support && resistance) {
    const distToSupport = ((price - support.price) / price * 100).toFixed(1);
    const distToResistance = ((resistance.price - price) / price * 100).toFixed(1);
    if (distToSupport <= 3) {
      explanation = `El precio está muy cerca de una zona donde históricamente ha rebotado hacia arriba. Puede ser un buen momento para prestar atención.`;
    } else if (distToResistance <= 3) {
      explanation = `El precio se está acercando a una zona donde antes encontró dificultades para seguir subiendo. Es posible que se frene ahí.`;
    } else {
      explanation = `El precio está entre dos zonas importantes. La zona de compra está ${distToSupport}% más abajo y la zona de cautela ${distToResistance}% más arriba.`;
    }
  } else if (support) {
    const dist = ((price - support.price) / price * 100).toFixed(1);
    explanation = `Hay una zona de compra ${dist}% más abajo, donde el precio ha rebotado ${support.touches} veces antes.`;
  } else if (resistance) {
    const dist = ((resistance.price - price) / price * 100).toFixed(1);
    explanation = `Hay una zona de cautela ${dist}% más arriba, donde el precio ha tenido dificultades ${resistance.touches} veces antes.`;
  }

  return {
    support: support ? {
      low:    Math.round(support.price * (1 - ZONE) * 100) / 100,
      high:   Math.round(support.price * (1 + ZONE) * 100) / 100,
      center: Math.round(support.price * 100) / 100,
      touches: support.touches
    } : null,
    resistance: resistance ? {
      low:    Math.round(resistance.price * (1 - ZONE) * 100) / 100,
      high:   Math.round(resistance.price * (1 + ZONE) * 100) / 100,
      center: Math.round(resistance.price * 100) / 100,
      touches: resistance.touches
    } : null,
    position,
    explanation
  };
}

function calcScore(price, ma50, ma100, ma200, rsi, dividendYield) {
  let score = 0;

  // Tendencia (40 pts)
  if (ma200 && price > ma200) score += 20;
  if (ma100 && price > ma100) score += 10;
  if (ma50  && price > ma50)  score += 10;

  // Momentum RSI (25 pts)
  if (rsi >= 40 && rsi <= 60)      score += 15;
  else if (rsi > 30 && rsi < 40)   score += 10;
  else if (rsi < 30)               score += 8;
  else if (rsi > 70)               score += 5;

  // Riesgo vs SMA200 (20 pts)
  if (ma200) {
    const pct = ((price - ma200) / ma200) * 100;
    if (Math.abs(pct) <= 5)       score += 20;
    else if (pct > 5 && pct <= 10) score += 15;
    else if (pct > 10 && pct <= 15)score += 12;
    else if (pct > 15)             score += 10;
    else                           score += 5;
  }

  // Dividendos (15 pts)
  const yield_pct = (dividendYield || 0) * 100;
  if (yield_pct >= 3)        score += 15;
  else if (yield_pct >= 2)   score += 10;
  else if (yield_pct >= 1)   score += 5;

  return Math.min(score, 100);
}

function scoreLabel(score) {
  if (score >= 80) return { zone: "Zona de inversión", color: "green" };
  if (score >= 60) return { zone: "Interesante",       color: "teal"  };
  if (score >= 40) return { zone: "Neutral",           color: "gray"  };
  return                  { zone: "Precaución",        color: "red"   };
}

function scoreExplain(score, zone, price, ma50, ma100, ma200, rsi, dividendYield) {
  const parts = [];
  if (ma200 && price > ma200) parts.push("está por encima de su media de largo plazo");
  else if (ma200) parts.push("está por debajo de su media de largo plazo");
  if (rsi >= 40 && rsi <= 60) parts.push("el RSI está en zona ideal de entrada");
  else if (rsi < 30) parts.push("el RSI indica sobreventa — posible rebote");
  else if (rsi > 70) parts.push("el RSI está sobrecomprado — precaución a corto plazo");
  const yp = (dividendYield || 0) * 100;
  if (yp >= 2) parts.push(`paga dividendos de ${yp.toFixed(1)}% anual`);
  const intro = score >= 60 ? "Este activo luce atractivo porque" : score >= 40 ? "Este activo está en zona neutral —" : "Este activo requiere precaución —";
  return `${intro} ${parts.join(", ")}.`;
}

async function getTickerData(ticker) {
  const [raw, summary] = await Promise.all([
    fetchYahoo(ticker.toUpperCase()),
    fetchYahooSummary(ticker.toUpperCase())
  ]);

  const result = raw?.chart?.result?.[0];
  if (!result) throw new Error(`Ticker no encontrado: ${ticker}`);

  const closes = result.indicators.quote[0].close.filter(Boolean);
  const meta = result.meta;
  const price = Math.round(meta.regularMarketPrice * 100) / 100;
  const name = meta.longName || meta.shortName || ticker.toUpperCase();
  const chg = calcChange(closes);
  const ma50  = calcSMA(closes, 50);
  const ma100 = calcSMA(closes, 100);
  const ma200 = calcSMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const signal = getSignal(price, ma50, ma100, ma200, rsi);

  const dividendYield = summary?.quoteSummary?.result?.[0]?.summaryDetail?.dividendYield?.raw || 0;
  const score = calcScore(price, ma50, ma100, ma200, rsi, dividendYield);
  const { zone } = scoreLabel(score);
  const scoreDesc = scoreExplain(score, zone, price, ma50, ma100, ma200, rsi, dividendYield);

  // Support & Resistance — use full 365d highs/lows
  const rawHighs  = result.indicators.quote[0].high.map(v => v || null);
  const rawLows   = result.indicators.quote[0].low.map(v => v || null);
  const allCloses = result.indicators.quote[0].close.map(v => v || null);
  const levels = detectLevels(rawHighs, rawLows, allCloses, price);

  return {
    ticker: ticker.toUpperCase(),
    name,
    price,
    chg,
    rsi,
    ma50:  ma50  ? Math.round(ma50  * 100) / 100 : null,
    ma100: ma100 ? Math.round(ma100 * 100) / 100 : null,
    ma200: ma200 ? Math.round(ma200 * 100) / 100 : null,
    signal,
    desc: buildDesc(ticker, price, ma50, ma100, ma200, rsi, signal),
    closes: closes.slice(-60),
    dividendYield: Math.round(dividendYield * 1000) / 10,
    score,
    scoreZone: zone,
    scoreDesc,
    levels,
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/quote") {
    const ticker = parsed.query.ticker;
    if (!ticker) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Falta parámetro ticker" }));
      return;
    }
    try {
      const data = await getTickerData(ticker);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Ruta no encontrada. Usa /quote?ticker=VOO" }));
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Prueba: http://localhost:${PORT}/quote?ticker=VOO`);
});
