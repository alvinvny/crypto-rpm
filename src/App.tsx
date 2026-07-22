import { useEffect, useState, useCallback, useRef } from "react";

import {  
  ResponsiveContainer,  
  LineChart,  
  Line,  
  XAxis,  
  YAxis,  
  Tooltip,  
  ReferenceLine,  
} from "recharts";

import {  
  TrendingUp,  
  Activity,  
  Target,  
  Gauge,  
  Shield,  
  Brain,  
  Zap,  
  Clock3,  
  Trophy,  
  Hourglass,  
  CheckCircle2,  
  BarChart3,  
  ArrowRightLeft,  
  ChevronUp,  
  ChevronDown,  
  Minus,  
  Layers,  
  DollarSign,  
  AlertTriangle,  
  Star,  
  Wallet,  
  PiggyBank,  
  TrendingDown,  
  CircleDollarSign,  
  Crosshair,  
  ArrowUp,  
  ArrowDown,  
  SkipForward,  
  Navigation,  
  Wifi,  
  WifiOff,  
  RefreshCw,  
} from "lucide-react";

import "./App.css";

// ============================================  
// TYPES  
// ============================================

interface ChartPoint {  
  time: string;  
  price: number;  
}

interface TimeframeSignal {  
  label: string;  
  period: string;  
  direction: "UP" | "DOWN";  
  confidence: number;  
  change: number;  
  dataPoints: number;  
}

interface EntrySignal {  
  action:  
    | "STRONG BUY YES"  
    | "BUY YES"  
    | "LEAN YES"  
    | "NEUTRAL"  
    | "LEAN NO"  
    | "BUY NO"  
    | "STRONG BUY NO";  
  fairValue: number;  
  edge: number | null;  
  riskReward: number | null;  
  potentialProfit: number | null;  
  potentialLoss: number | null;  
  confluenceScore: number;  
  confluenceLabel: string;  
  starRating: number;  
}

interface PredictionRecord {  
  id: number;  
  time: string;  
  signal: string;  
  confidence: number;  
  initialPrice: number;  
  finalPrice?: number;  
  predictionTimestamp: number;  
  gradedTimestamp?: number;  
  status: "PENDING" | "WIN" | "LOSS";  
  kalshiYes?: number;  
  kalshiNo?: number;  
  edge?: number;  
  confluenceScore?: number;  
  recommendedBet?: number;  
  entryAction?: string;  
  targetPrice?: number;  
  betSide?: "UP" | "DOWN" | "SKIP";  
}

interface KalshiMarket {  
  ticker: string;  
  event_ticker: string;  
  yes_ask_dollars: string;  
  no_ask_dollars: string;  
  yes_bid_dollars: string;  
  no_bid_dollars: string;  
  last_price_dollars: string;  
  close_time: string;  
  status: string;  
  floor_strike?: number;  
  cap_strike?: number;  
  yes_sub_title: string;  
  no_sub_title: string;  
  volume_24h_fp: string;  
}

// ============================================  
// HELPER FUNCTIONS  
// ============================================

function calculateChange(prices: number[]): number {  
  if (prices.length < 2) return 0;  
  const first = prices[0];  
  const last = prices[prices.length - 1];  
  return ((last - first) / first) * 100;  
}

function calculateConfidence(change: number): number {  
  return Math.min(95, Math.max(51, Math.round(55 + Math.abs(change) * 20)));  
}

function calculateDirection(change: number): "UP" | "DOWN" {  
  return change >= 0 ? "UP" : "DOWN";  
}

function getKellyFraction(  
  winRate: number,  
  avgWinAmount: number,  
  avgLossAmount: number  
): number {  
  if (avgLossAmount === 0 || winRate <= 0 || winRate >= 1) return 0;  
  const b = avgWinAmount / avgLossAmount;  
  const kelly = (winRate * b - (1 - winRate)) / b;  
  return Math.max(0, Math.min(0.25, kelly));  
}

function dollarsToCents(dollarStr: string): number {  
  const val = parseFloat(dollarStr);  
  if (isNaN(val)) return 0;  
  return Math.round(val * 100);  
}

// ============================================  
// KALSHI API CONFIG  
// ============================================  
const KALSHI_BASE = "/kalshi-api";  
const BTC_SERIES_TICKERS = ["KXBTC15M", "KXBTCD", "KXBTC"];

// ============================================  
// MAIN APP  
// ============================================

function App() {  
  const [btcPrice, setBtcPrice] = useState<number | null>(null);  
  const [prevBtcPrice, setPrevBtcPrice] = useState<number | null>(null);  
  const [chartData, setChartData] = useState<ChartPoint[]>([]);  
  const [liveChartData, setLiveChartData] = useState<ChartPoint[]>([]);  
  const [timeLeft, setTimeLeft] = useState("");  
  const [gradingMessage, setGradingMessage] = useState<string | null>(null);

  // Target Mode — no localStorage caching, always from Kalshi  
  const [targetPriceInput, setTargetPriceInput] = useState<string>("");  
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  const [kalshiUpInput, setKalshiUpInput] = useState<string>("");  
  const [kalshiDownInput, setKalshiDownInput] = useState<string>("");  
  const [kalshiUp, setKalshiUp] = useState<number | null>(null);  
  const [kalshiDown, setKalshiDown] = useState<number | null>(null);

  // Legacy Kalshi YES input  
  const [kalshiYesInput, setKalshiYesInput] = useState<string>("");  
  const [kalshiYes, setKalshiYes] = useState<number | null>(null);

  // Kalshi API state  
  const [kalshiConnected, setKalshiConnected] = useState<boolean>(false);  
  const [kalshiLastUpdate, setKalshiLastUpdate] = useState<string>("");  
  const [kalshiMarketTicker, setKalshiMarketTicker] = useState<string>("");  
  const [kalshiCloseTime, setKalshiCloseTime] = useState<string>("");  
  const [kalshiError, setKalshiError] = useState<string | null>(null);

  // Bankroll state  
  const [bankrollInput, setBankrollInput] = useState<string>(() => {  
    return localStorage.getItem("cryptoRPMBankroll") || "";  
  });  
  const [bankroll, setBankroll] = useState<number | null>(() => {  
    const saved = localStorage.getItem("cryptoRPMBankroll");  
    return saved ? parseFloat(saved) : null;  
  });

  // Multi-timeframe data  
  const [rawPrices1h, setRawPrices1h] = useState<number[]>([]);  
  const [rawPrices4h, setRawPrices4h] = useState<number[]>([]);  
  const [_rawPrices24h, setRawPrices24h] = useState<number[]>([]);

  // Price history for momentum tracking  
  const priceHistory = useRef<number[]>([]);

  // Journal state  
  const [journal, setJournal] = useState<PredictionRecord[]>(() => {  
    const saved = localStorage.getItem("cryptoRPMJournal");  
    if (saved) {  
      const parsed = JSON.parse(saved);  
      return parsed.map((entry: any) => ({  
        ...entry,  
        initialPrice:  
          entry.initialPrice !== undefined ? entry.initialPrice : entry.price,  
        predictionTimestamp:  
          entry.predictionTimestamp !== undefined  
            ? entry.predictionTimestamp  
            : entry.id,  
        status: entry.status || "PENDING",  
        finalPrice: entry.finalPrice || undefined,  
        gradedTimestamp: entry.gradedTimestamp || undefined,  
        kalshiYes: entry.kalshiYes || undefined,  
        kalshiNo: entry.kalshiNo || undefined,  
        edge: entry.edge || undefined,  
        confluenceScore: entry.confluenceScore || undefined,  
        recommendedBet: entry.recommendedBet || undefined,  
        entryAction: entry.entryAction || undefined,  
        targetPrice: entry.targetPrice || undefined,  
        betSide: entry.betSide || undefined,  
      }));  
    }  
    return [];  
  });

  const [journalFilter, setJournalFilter] = useState<  
    "ALL" | "PENDING" | "WIN" | "LOSS"  
  >("ALL");

  const journalRef = useRef(journal);  
  useEffect(() => {  
    journalRef.current = journal;  
  }, [journal]);

  useEffect(() => {  
    localStorage.setItem("cryptoRPMJournal", JSON.stringify(journal));  
  }, [journal]);

  useEffect(() => {  
    if (bankroll !== null) {  
      localStorage.setItem("cryptoRPMBankroll", bankroll.toString());  
    }  
  }, [bankroll]);

  // Live chart — add a point every time btcPrice changes  
  useEffect(() => {  
    if (btcPrice === null) return;  
    const now = new Date();  
    const timeStr = now.toLocaleTimeString([], {  
      hour: "2-digit",  
      minute: "2-digit",  
      second: "2-digit",  
    });  
    setLiveChartData((prev) => {  
      const newPoint = { time: timeStr, price: btcPrice };  
      const updated = [...prev, newPoint].slice(-120);  
      return updated;  
    });  
  }, [btcPrice]);

  // ============================================  
  // DATA LOADING  
  // ============================================

  const loadPrice = useCallback(async () => {  
  try {  
    const response = await fetch(  
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"  
    );  
    if (response.ok) {  
      const data = await response.json();  
      const newPrice = parseFloat(data.price);  
      setBtcPrice((prev) => {  
        setPrevBtcPrice(prev);  
        return newPrice;  
      });  
      priceHistory.current = [...priceHistory.current.slice(-59), newPrice];  
      return;  
    }  
  } catch (e) {  
    // fallback  
  }  
  try {  
    const priceResponse = await fetch(  
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"  
    );  
    if (!priceResponse.ok) throw new Error("Price fetch failed");  
    const priceData = await priceResponse.json();  
    const newPrice = priceData.bitcoin.usd;  
    setBtcPrice((prev) => {  
      setPrevBtcPrice(prev);  
      return newPrice;  
    });  
    priceHistory.current = [...priceHistory.current.slice(-59), newPrice];  
  } catch (error) {  
    console.error("Error fetching price:", error);  
  }  
}, []);  

  const loadChartData = useCallback(async () => {  
    try {  
      const chart1dResponse = await fetch(  
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1"  
      );  
      if (!chart1dResponse.ok)  
        throw new Error(  
          `1d chart fetch failed: ${chart1dResponse.statusText}`  
        );  
      const chart1dJson = await chart1dResponse.json();

      const formatted = chart1dJson.prices  
        .slice(-48)  
        .map((item: number[]) => ({  
          time: new Date(item[0]).toLocaleTimeString([], {  
            hour: "2-digit",  
            minute: "2-digit",  
          }),  
          price: Math.round(item[1]),  
        }));  
      setChartData(formatted);

      const allPrices1d: number[] = chart1dJson.prices.map(  
        (p: number[]) => p[1]  
      );

      setRawPrices1h(allPrices1d.slice(-12));  
      setRawPrices4h(allPrices1d.slice(-48));  
      setRawPrices24h(allPrices1d);  
    } catch (error) {  
      console.error("Error fetching chart data:", error);  
    }  
  }, []);

  // ============================================  
  // KALSHI API  
  // ============================================

  const loadKalshiData = useCallback(async () => {  
    if (!btcPrice || btcPrice === 0) {  
      console.log("⏳ Waiting for BTC price before loading Kalshi...");  
      return;  
    }

    let found = false;

    for (const seriesTicker of BTC_SERIES_TICKERS) {  
      if (found) break;

      try {  
        const eventsRes = await fetch(  
          `${KALSHI_BASE}/events?status=open&series_ticker=${seriesTicker}&with_nested_markets=true&limit=50`  
        );

        if (!eventsRes.ok) continue;  
        const eventsData = await eventsRes.json();

        if (!eventsData.events || eventsData.events.length === 0) continue;

        const now = new Date();

        const allMarkets: Array<{  
          market: KalshiMarket;  
          closeTime: Date;  
          strike: number | null;  
          strikeDistance: number;  
          minutesUntilClose: number;  
        }> = [];

        for (const event of eventsData.events) {  
          if (!event.markets) continue;

          for (const market of event.markets) {  
            if (  
              market.status !== "active" &&  
              market.status !== "open" &&  
              market.status !== "initialized"  
            )  
              continue;

            const closeTime = new Date(market.close_time);  
            if (closeTime <= now) continue;

            const strike = market.floor_strike || market.cap_strike || null;  
            const strikeDistance = strike  
              ? Math.abs(btcPrice - strike)  
              : 999999;  
            const minutesUntilClose =  
              (closeTime.getTime() - now.getTime()) / 60000;

            allMarkets.push({  
              market: market as KalshiMarket,  
              closeTime,  
              strike,  
              strikeDistance,  
              minutesUntilClose,  
            });  
          }  
        }

        if (allMarkets.length === 0) continue;

        const closeTimeGroups = new Map<string, typeof allMarkets>();  
        for (const m of allMarkets) {  
          const key = m.closeTime.toISOString();  
          if (!closeTimeGroups.has(key)) {  
            closeTimeGroups.set(key, []);  
          }  
          closeTimeGroups.get(key)!.push(m);  
        }

        const sortedGroups = Array.from(closeTimeGroups.entries()).sort(  
          (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()  
        );

        const nextExpiryGroup = sortedGroups[0];  
        if (!nextExpiryGroup) continue;

        const nextExpiryMarkets = nextExpiryGroup[1];

        nextExpiryMarkets.sort((a, b) => a.strikeDistance - b.strikeDistance);

        const best = nextExpiryMarkets[0];  
        const bestMarket = best.market;  
        const bestCloseTime = best.closeTime;

        found = true;

        const yesAsk = dollarsToCents(bestMarket.yes_ask_dollars);  
        const noAsk = dollarsToCents(bestMarket.no_ask_dollars);  
        const yesBid = dollarsToCents(bestMarket.yes_bid_dollars);  
        const noBid = dollarsToCents(bestMarket.no_bid_dollars);

        const upPrice = yesAsk > 0 ? yesAsk : yesBid;  
        const downPrice = noAsk > 0 ? noAsk : noBid;

        if (upPrice > 0 && upPrice <= 99) {  
          setKalshiUp(upPrice);  
          setKalshiUpInput(upPrice.toString());  
        } else {  
          setKalshiUp(null);  
          setKalshiUpInput("");  
        }

        if (downPrice > 0 && downPrice <= 99) {  
          setKalshiDown(downPrice);  
          setKalshiDownInput(downPrice.toString());  
        } else {  
          setKalshiDown(null);  
          setKalshiDownInput("");  
        }

        const strike = best.strike;  
        if (strike && strike > 0) {  
          setTargetPrice(strike);  
          setTargetPriceInput(strike.toString());  
        }

        setKalshiConnected(true);  
        setKalshiLastUpdate(  
          new Date().toLocaleTimeString([], {  
            hour: "2-digit",  
            minute: "2-digit",  
            second: "2-digit",  
          })  
        );  
        setKalshiMarketTicker(bestMarket.ticker);  
        setKalshiCloseTime(  
          bestCloseTime  
            ? bestCloseTime.toLocaleTimeString([], {  
                hour: "2-digit",  
                minute: "2-digit",  
              })  
            : ""  
        );  
        setKalshiError(null);

        console.log("✅ Kalshi picked:", {  
          ticker: bestMarket.ticker,  
          strike,  
          btcPrice,  
          strikeDistance: Math.round(best.strikeDistance),  
          upPrice,  
          downPrice,  
          closesIn: Math.round(best.minutesUntilClose) + "min",  
          nextExpiry: bestCloseTime.toLocaleTimeString(),  
          totalStrikes: nextExpiryMarkets.length,  
          allTimeWindows: sortedGroups.length,  
        });  
      } catch (error) {  
        console.error(`Kalshi fetch error (${seriesTicker}):`, error);  
      }  
    }

    if (!found) {  
      setKalshiConnected(false);  
      setKalshiError(  
        "No active BTC 15-min contracts found. Markets may be closed."  
      );  
    }  
  }, [btcPrice]);

  // ============================================  
  // AUTO-GRADING  
  // ============================================

  const autoGradePredictions = useCallback(async () => {  
    const now = Date.now();  
    const FIFTEEN_MINUTES = 15 * 60 * 1000;  
    const currentJournal = journalRef.current;

    const pendingToGrade = currentJournal.filter(  
      (entry) =>  
        entry.status === "PENDING" &&  
        now - entry.predictionTimestamp >= FIFTEEN_MINUTES  
    );

    if (pendingToGrade.length === 0) return;

    let currentBtcPrice: number | null = null;  
    try {  
      const priceResponse = await fetch(  
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"  
      );  
      if (!priceResponse.ok) throw new Error("Grading price fetch failed");  
      const priceData = await priceResponse.json();  
      currentBtcPrice = priceData.bitcoin.usd;  
    } catch (error) {  
      console.error("Error fetching price for grading:", error);  
      return;  
    }

    if (currentBtcPrice === null) return;

    const finalPrice = currentBtcPrice;  
    const gradedTimestamp = Date.now();

    setGradingMessage(  
      `Auto-grading ${pendingToGrade.length} prediction${  
        pendingToGrade.length > 1 ? "s" : ""  
      }...`  
    );

    setJournal((prevJournal) =>  
      prevJournal.map((entry) => {  
        if (  
          entry.status === "PENDING" &&  
          now - entry.predictionTimestamp >= FIFTEEN_MINUTES  
        ) {  
          let newStatus: "WIN" | "LOSS" = "LOSS";

          if (  
            entry.targetPrice &&  
            entry.betSide &&  
            entry.betSide !== "SKIP"  
          ) {  
            const isAbove = finalPrice > entry.targetPrice;  
            if (entry.betSide === "UP") {  
              newStatus = isAbove ? "WIN" : "LOSS";  
            } else if (entry.betSide === "DOWN") {  
              newStatus = !isAbove ? "WIN" : "LOSS";  
            }  
          } else {  
            if (  
              entry.signal.includes("UP") ||  
              entry.signal.includes("ABOVE")  
            ) {  
              newStatus = finalPrice > entry.initialPrice ? "WIN" : "LOSS";  
            } else if (  
              entry.signal.includes("DOWN") ||  
              entry.signal.includes("BELOW")  
            ) {  
              newStatus = finalPrice < entry.initialPrice ? "WIN" : "LOSS";  
            }  
          }

          return {  
            ...entry,  
            status: newStatus,  
            finalPrice,  
            gradedTimestamp,  
          };  
        }  
        return entry;  
      })  
    );

    setTimeout(() => setGradingMessage(null), 3000);  
  }, []);

  // ============================================  
  // INTERVALS  
  // ============================================

useEffect(() => {  
  loadPrice();  
  loadChartData();  
  autoGradePredictions();  
  loadKalshiData();

  // WebSocket through Vite proxy  
  let ws: WebSocket | null = null;  
  let wsRetryTimeout: ReturnType<typeof setTimeout> | null = null;  
  let wsConnected = false;

  const connectWebSocket = () => {  
    try {  
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";  
      const wsUrl = `${protocol}//${window.location.host}/binance-ws/ws/btcusdt@aggTrade`;  
        
      console.log("🔌 Connecting WebSocket to:", wsUrl);  
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {  
        console.log("✅ Binance WebSocket connected — real-time price active");  
        wsConnected = true;  
      };

      ws.onmessage = (event) => {  
        try {  
          const data = JSON.parse(event.data);  
          const newPrice = parseFloat(data.p);  
          if (newPrice > 0) {  
            setBtcPrice((prev) => {  
              setPrevBtcPrice(prev);  
              return newPrice;  
            });  
            priceHistory.current = [...priceHistory.current.slice(-59), newPrice];  
          }  
        } catch (e) {  
          // ignore parse errors  
        }  
      };

      ws.onclose = () => {  
        console.log("WebSocket closed, reconnecting in 5s...");  
        wsConnected = false;  
        wsRetryTimeout = setTimeout(connectWebSocket, 5000);  
      };

      ws.onerror = (err) => {  
        console.log("WebSocket error:", err);  
        wsConnected = false;  
        if (ws) ws.close();  
      };  
    } catch (e) {  
      console.log("WebSocket setup failed, using polling only");  
    }  
  };

  connectWebSocket();

  // Polling fallback — always runs, covers WebSocket failures  
  const priceInterval = setInterval(loadPrice, wsConnected ? 5000 : 1000);  
  const chartInterval = setInterval(loadChartData, 60000);  
  const gradeInterval = setInterval(autoGradePredictions, 15000);  
  const kalshiInterval = setInterval(loadKalshiData, 10000);

  return () => {  
    if (ws) ws.close();  
    if (wsRetryTimeout) clearTimeout(wsRetryTimeout);  
    clearInterval(priceInterval);  
    clearInterval(chartInterval);  
    clearInterval(gradeInterval);  
    clearInterval(kalshiInterval);  
  };  
}, [loadPrice, loadChartData, autoGradePredictions, loadKalshiData]);  

  // Countdown timer  
  useEffect(() => {  
    const timer = setInterval(() => {  
      const now = new Date();  
      const next = new Date();  
      next.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);  
      next.setSeconds(0);  
      next.setMilliseconds(0);  
      const diff = next.getTime() - now.getTime();  
      const mins = Math.floor(diff / 60000);  
      const secs = Math.floor((diff % 60000) / 1000);  
      setTimeLeft(`${mins}m ${secs.toString().padStart(2, "0")}s`);  
    }, 1000);  
    return () => clearInterval(timer);  
  }, []);

  // ============================================  
  // LOADING STATE  
  // ============================================

  if (!chartData.length || btcPrice === null) {  
    return <div className="loading">Loading CryptoRPM...</div>;  
  }

  // ============================================  
  // TARGET MODE CALCULATIONS  
  // ============================================

  const distanceDollar =  
    targetPrice !== null ? btcPrice - targetPrice : null;  
  const distancePercent =  
    targetPrice !== null && targetPrice > 0  
      ? ((btcPrice - targetPrice) / targetPrice) * 100  
      : null;  
  const isAboveTarget = distanceDollar !== null ? distanceDollar > 0 : null;

  const priceDirection =  
    prevBtcPrice !== null  
      ? btcPrice > prevBtcPrice  
        ? "up"  
        : btcPrice < prevBtcPrice  
        ? "down"  
        : "same"  
      : "same";

  const getMomentum = () => {  
    const history = priceHistory.current;  
    if (history.length < 3 || targetPrice === null)  
      return { direction: "neutral", label: "CALCULATING", speed: "—" };

    const recent = history.slice(-3);  
    const distancesFromTarget = recent.map((p) => Math.abs(p - targetPrice));

    const movingToward = distancesFromTarget[2] < distancesFromTarget[0];  
    const movingAway = distancesFromTarget[2] > distancesFromTarget[0];

    const priceChange = Math.abs(recent[2] - recent[0]);  
    let speed = "SLOW";  
    if (priceChange > 50) speed = "FAST";  
    else if (priceChange > 20) speed = "MODERATE";

    if (movingToward)  
      return { direction: "toward", label: "→ TOWARD TARGET", speed };  
    if (movingAway)  
      return { direction: "away", label: "← AWAY FROM TARGET", speed };  
    return { direction: "sideways", label: "↔ SIDEWAYS", speed };  
  };

  const momentum = getMomentum();

  // ============================================  
  // MULTI-TIMEFRAME SIGNALS  
  // ============================================

  const buildSignal = (  
    label: string,  
    period: string,  
    prices: number[],  
    sliceCount: number  
  ): TimeframeSignal => {  
    const sliced = prices.slice(-sliceCount);  
    const change = calculateChange(sliced);  
    return {  
      label,  
      period,  
      direction: calculateDirection(change),  
      confidence: calculateConfidence(change),  
      change,  
      dataPoints: sliced.length,  
    };  
  };

  const signal5m = buildSignal("5 MIN", "5m", rawPrices1h, 2);  
  const signal15m = buildSignal("15 MIN", "15m", rawPrices1h, 4);  
  const signal1h = buildSignal(  
    "1 HOUR",  
    "1h",  
    rawPrices1h,  
    rawPrices1h.length  
  );  
  const signal4h = buildSignal(  
    "4 HOUR",  
    "4h",  
    rawPrices4h,  
    rawPrices4h.length  
  );

  const allSignals: TimeframeSignal[] = [  
    signal5m,  
    signal15m,  
    signal1h,  
    signal4h,  
  ];

  const bullishCount = allSignals.filter((s) => s.direction === "UP").length;  
  const confluenceScore = Math.round(  
    (bullishCount / allSignals.length) * 100  
  );

  const getConfluenceLabel = (score: number): string => {  
    if (score >= 100) return "PERFECT CONFLUENCE";  
    if (score >= 75) return "STRONG CONFLUENCE";  
    if (score >= 50) return "MODERATE";  
    if (score >= 25) return "WEAK / MIXED";  
    return "OPPOSING SIGNALS";  
  };

  const getStarRating = (score: number): number => {  
    if (score >= 100) return 5;  
    if (score >= 75) return 4;  
    if (score >= 50) return 3;  
    if (score >= 25) return 2;  
    return 1;  
  };

  const confluenceLabel = getConfluenceLabel(confluenceScore);  
  const starRating = getStarRating(confluenceScore);

  const weights = [1, 2, 3, 4];  
  const totalWeight = weights.reduce((a, b) => a + b, 0);  
  const weightedConfidence = Math.round(  
    allSignals.reduce((sum, signal, i) => {  
      const directionMultiplier = signal.direction === "UP" ? 1 : -1;  
      return sum + signal.confidence * directionMultiplier * weights[i];  
    }, 0) / totalWeight  
  );  
  const fairValue = Math.min(95, Math.max(5, 50 + weightedConfidence / 2));

  // ============================================  
  // PRIMARY METRICS  
  // ============================================

  const firstPrice = chartData[0].price;  
  const lastPrice = chartData[chartData.length - 1].price;  
  const change = ((lastPrice - firstPrice) / firstPrice) * 100;  
  const prediction = change >= 0 ? "UP ⬆" : "DOWN ⬇";  
  const confidence = signal15m.confidence;  
  const rpm = Math.max(  
    1000,  
    Math.min(9000, Math.round(5000 + change * 2500))  
  );  
  const signalStrength = Math.round((rpm / 9000) * 100);  
  const marketHealth = Math.min(  
    100,  
    Math.round(confidence + signalStrength / 4)  
  );  
  const volatility = Math.round(Math.abs(change) * 20);

  // ============================================  
  // TARGET PREDICTION  
  // ============================================

  const getTargetPrediction = (): {  
    side: "UP" | "DOWN" | "SKIP";  
    confidence: number;  
    reason: string;  
  } => {  
    if (  
      targetPrice === null ||  
      distanceDollar === null ||  
      distancePercent === null  
    ) {  
      return { side: "SKIP", confidence: 0, reason: "No target set" };  
    }

    const absDistPercent = Math.abs(distancePercent);

    let baseConfidence: number;  
    if (absDistPercent > 0.5) baseConfidence = 85;  
    else if (absDistPercent > 0.2) baseConfidence = 72;  
    else if (absDistPercent > 0.1) baseConfidence = 62;  
    else baseConfidence = 53;

    let momentumBonus = 0;  
    if (momentum.direction === "toward") momentumBonus = -5;  
    if (momentum.direction === "away") momentumBonus = 5;

    const confluenceBonus = (confluenceScore - 50) / 10;

    const adjustedConfidence = Math.min(  
      95,  
      Math.max(  
        51,  
        Math.round(baseConfidence + momentumBonus + confluenceBonus)  
      )  
    );

    if (isAboveTarget) {  
      if (momentum.direction === "toward" && absDistPercent < 0.05) {  
        return {  
          side: "SKIP",  
          confidence: adjustedConfidence,  
          reason: "Too close to target + moving toward it",  
        };  
      }  
      return {  
        side: "UP",  
        confidence: adjustedConfidence,  
        reason: `Price is $${Math.abs(distanceDollar).toFixed(  
          2  
        )} above target (${absDistPercent.toFixed(3)}%)`,  
      };  
    } else {  
      if (momentum.direction === "toward" && absDistPercent < 0.05) {  
        return {  
          side: "SKIP",  
          confidence: adjustedConfidence,  
          reason: "Too close to target + moving toward it",  
        };  
      }  
      return {  
        side: "DOWN",  
        confidence: adjustedConfidence,  
        reason: `Price is $${Math.abs(distanceDollar).toFixed(  
          2  
        )} below target (${absDistPercent.toFixed(3)}%)`,  
      };  
    }  
  };

  const targetPrediction = getTargetPrediction();

  // ============================================  
  // RECOMMENDATION ENGINE  
  // ============================================

  const getRecommendation = (): {  
    action: string;  
    color: string;  
    edge: number | null;  
    betSide: "UP" | "DOWN" | "SKIP";  
    explanation: string;  
  } => {  
    if (targetPrice === null) {  
      return {  
        action: kalshiConnected  
          ? "LOADING TARGET FROM KALSHI..."  
          : "SET TARGET PRICE",  
        color: "action-neutral",  
        edge: null,  
        betSide: "SKIP",  
        explanation: kalshiConnected  
          ? "Waiting for Kalshi data..."  
          : "Enter the Kalshi TO BEAT price to get recommendations",  
      };  
    }

    if (targetPrediction.side === "SKIP") {  
      return {  
        action: "⚠️ SKIP THIS TRADE",  
        color: "action-neutral",  
        edge: null,  
        betSide: "SKIP",  
        explanation: targetPrediction.reason,  
      };  
    }

    if (kalshiUp !== null && kalshiDown !== null) {  
      if (targetPrediction.side === "UP") {  
        const edgeOnUp = targetPrediction.confidence - kalshiUp;  
        if (edgeOnUp >= 20)  
          return {  
            action: `🟢 STRONG BUY UP @ ${kalshiUp}¢`,  
            color: "action-strong-buy",  
            edge: edgeOnUp,  
            betSide: "UP",  
            explanation: `Fair value ${targetPrediction.confidence}% vs Kalshi ${kalshiUp}¢ = +${Math.round(edgeOnUp)}% edge`,  
          };  
        if (edgeOnUp >= 10)  
          return {  
            action: `BUY UP @ ${kalshiUp}¢`,  
            color: "action-buy",  
            edge: edgeOnUp,  
            betSide: "UP",  
            explanation: `+${Math.round(edgeOnUp)}% edge`,  
          };  
        if (edgeOnUp >= 3)  
          return {  
            action: `LEAN UP @ ${kalshiUp}¢`,  
            color: "action-lean-buy",  
            edge: edgeOnUp,  
            betSide: "UP",  
            explanation: `Small edge of +${Math.round(edgeOnUp)}%`,  
          };  
        return {  
          action: "⚠️ NO EDGE — SKIP",  
          color: "action-neutral",  
          edge: edgeOnUp,  
          betSide: "SKIP",  
          explanation: `Edge too small (${Math.round(edgeOnUp)}%). Wait for better pricing.`,  
        };  
      } else {  
        const edgeOnDown = targetPrediction.confidence - kalshiDown;  
        if (edgeOnDown >= 20)  
          return {  
            action: `🔴 STRONG BUY DOWN @ ${kalshiDown}¢`,  
            color: "action-strong-sell",  
            edge: edgeOnDown,  
            betSide: "DOWN",  
            explanation: `Fair value ${targetPrediction.confidence}% vs Kalshi ${kalshiDown}¢ = +${Math.round(edgeOnDown)}% edge`,  
          };  
        if (edgeOnDown >= 10)  
          return {  
            action: `BUY DOWN @ ${kalshiDown}¢`,  
            color: "action-sell",  
            edge: edgeOnDown,  
            betSide: "DOWN",  
            explanation: `+${Math.round(edgeOnDown)}% edge`,  
          };  
        if (edgeOnDown >= 3)  
          return {  
            action: `LEAN DOWN @ ${kalshiDown}¢`,  
            color: "action-lean-sell",  
            edge: edgeOnDown,  
            betSide: "DOWN",  
            explanation: `Small edge of +${Math.round(edgeOnDown)}%`,  
          };  
        return {  
          action: "⚠️ NO EDGE — SKIP",  
          color: "action-neutral",  
          edge: edgeOnDown,  
          betSide: "SKIP",  
          explanation: `Edge too small (${Math.round(edgeOnDown)}%). Wait for better pricing.`,  
        };  
      }  
    }

    return {  
      action:  
        targetPrediction.side === "UP"  
          ? "PREDICTION: ABOVE TARGET ⬆"  
          : "PREDICTION: BELOW TARGET ⬇",  
      color: targetPrediction.side === "UP" ? "action-buy" : "action-sell",  
      edge: null,  
      betSide: targetPrediction.side,  
      explanation: `${targetPrediction.reason}. Enter Kalshi prices for edge calculation.`,  
    };  
  };

  const recommendation = getRecommendation();

  // ============================================  
  // SMART ENTRY SIGNAL (legacy)  
  // ============================================

  const buildEntrySignal = (): EntrySignal => {  
    const edge = kalshiYes !== null ? fairValue - kalshiYes : null;  
    let riskReward: number | null = null;  
    let potentialProfit: number | null = null;  
    let potentialLoss: number | null = null;

    if (kalshiYes !== null) {  
      const kalshiCents = kalshiYes;  
      potentialProfit = 100 - kalshiCents;  
      potentialLoss = kalshiCents;  
      riskReward = potentialLoss > 0 ? potentialProfit / potentialLoss : 0;  
    }

    let action: EntrySignal["action"] = "NEUTRAL";

    if (edge !== null) {  
      if (edge >= 25 && confluenceScore >= 75) action = "STRONG BUY YES";  
      else if (edge >= 15 && confluenceScore >= 50) action = "BUY YES";  
      else if (edge >= 5) action = "LEAN YES";  
      else if (edge <= -25 && confluenceScore <= 25)  
        action = "STRONG BUY NO";  
      else if (edge <= -15 && confluenceScore <= 50) action = "BUY NO";  
      else if (edge <= -5) action = "LEAN NO";  
      else action = "NEUTRAL";  
    } else {  
      if (confluenceScore >= 100) action = "STRONG BUY YES";  
      else if (confluenceScore >= 75) action = "BUY YES";  
      else if (confluenceScore >= 50) action = "LEAN YES";  
      else if (confluenceScore <= 0) action = "STRONG BUY NO";  
      else if (confluenceScore <= 25) action = "BUY NO";  
      else action = "NEUTRAL";  
    }

    return {  
      action,  
      fairValue,  
      edge,  
      riskReward,  
      potentialProfit,  
      potentialLoss,  
      confluenceScore,  
      confluenceLabel,  
      starRating,  
    };  
  };

  const entrySignal = buildEntrySignal();

  const getActionColor = (action: string): string => {  
    if (action.includes("STRONG BUY UP") || action.includes("STRONG BUY YES"))  
      return "action-strong-buy";  
    if (  
      action.includes("BUY UP") ||  
      action.includes("BUY YES") ||  
      action.includes("ABOVE")  
    )  
      return "action-buy";  
    if (action.includes("LEAN UP") || action.includes("LEAN YES"))  
      return "action-lean-buy";  
    if (  
      action.includes("STRONG BUY DOWN") ||  
      action.includes("STRONG BUY NO")  
    )  
      return "action-strong-sell";  
    if (  
      action.includes("BUY DOWN") ||  
      action.includes("BUY NO") ||  
      action.includes("BELOW")  
    )  
      return "action-sell";  
    if (action.includes("LEAN DOWN") || action.includes("LEAN NO"))  
      return "action-lean-sell";  
    return "action-neutral";  
  };

  // ============================================  
  // BANKROLL / KELLY CRITERION  
  // ============================================

  const wins = journal.filter((e) => e.status === "WIN").length;  
  const losses = journal.filter((e) => e.status === "LOSS").length;  
  const pendingCount = journal.filter(  
    (e) => e.status === "PENDING"  
  ).length;  
  const accuracy =  
    wins + losses === 0  
      ? 0  
      : Math.round((wins / (wins + losses)) * 100);

  const winRate = wins + losses === 0 ? 0.5 : wins / (wins + losses);

  const kalshiTradesWithData = journal.filter(  
    (e) =>  
      (e.kalshiYes !== undefined || e.kalshiNo !== undefined) &&  
      e.status !== "PENDING"  
  );

  let avgWin = 68;  
  let avgLoss = 32;

  if (kalshiTradesWithData.length > 0) {  
    const winTrades = kalshiTradesWithData.filter(  
      (e) => e.status === "WIN"  
    );  
    const lossTrades = kalshiTradesWithData.filter(  
      (e) => e.status === "LOSS"  
    );

    if (winTrades.length > 0) {  
      avgWin =  
        winTrades.reduce(  
          (sum, e) => sum + (100 - (e.kalshiYes || e.kalshiNo || 50)),  
          0  
        ) / winTrades.length;  
    }  
    if (lossTrades.length > 0) {  
      avgLoss =  
        lossTrades.reduce(  
          (sum, e) => sum + (e.kalshiYes || e.kalshiNo || 50),  
          0  
        ) / lossTrades.length;  
    }  
  }

  const kellyFraction = getKellyFraction(winRate, avgWin, avgLoss);  
  const halfKelly = kellyFraction / 2;

  const recommendedBet =  
    bankroll !== null  
      ? Math.round(bankroll * halfKelly * 100) / 100  
      : null;  
  const maxBet =  
    bankroll !== null  
      ? Math.round(bankroll * kellyFraction * 100) / 100  
      : null;

  const betCost =  
    recommendation.betSide === "UP" && kalshiUp !== null  
      ? kalshiUp  
      : recommendation.betSide === "DOWN" && kalshiDown !== null  
      ? kalshiDown  
      : kalshiYes;

  const evPerTrade =  
    betCost !== null  
      ? Math.round(winRate * (100 - betCost) - (1 - winRate) * betCost)  
      : null;

  const evDollar =  
    recommendedBet !== null && evPerTrade !== null  
      ? Math.round((recommendedBet * evPerTrade) / 100)  
      : null;

  const calculateWinStreak = () => {  
    let currentStreak = 0;  
    const gradedEntries = journal.filter(  
      (entry) => entry.status === "WIN" || entry.status === "LOSS"  
    );  
    for (const entry of gradedEntries) {  
      if (entry.status === "WIN") currentStreak++;  
      else break;  
    }  
    return currentStreak;  
  };  
  const winStreak = calculateWinStreak();

  const edgePredictions = journal.filter(  
    (e) => e.edge !== undefined && e.status !== "PENDING"  
  );  
  const edgeWins = edgePredictions.filter(  
    (e) => e.status === "WIN"  
  ).length;  
  const edgeAccuracy =  
    edgePredictions.length === 0  
      ? 0  
      : Math.round((edgeWins / edgePredictions.length) * 100);  
  const avgEdge =  
    edgePredictions.length === 0  
      ? 0  
      : Math.round(  
          edgePredictions.reduce(  
            (sum, e) => sum + Math.abs(e.edge || 0),  
            0  
          ) / edgePredictions.length  
        );

  const kalshiEdge = kalshiYes !== null ? fairValue - kalshiYes : null;

  const getEdgeVerdict = (edgeValue: number) => {  
    const absEdge = Math.abs(edgeValue);  
    if (absEdge >= 20) return { label: "STRONG EDGE", tier: "strong" };  
    if (absEdge >= 10) return { label: "MODERATE EDGE", tier: "moderate" };  
    if (absEdge >= 5) return { label: "SLIGHT EDGE", tier: "slight" };  
    return { label: "NO EDGE", tier: "none" };  
  };

  const getEdgeDirection = (edgeValue: number) => {  
    if (edgeValue > 0) return "CryptoRPM is MORE bullish than Kalshi";  
    if (edgeValue < 0) return "CryptoRPM is LESS bullish than Kalshi";  
    return "CryptoRPM and Kalshi agree";  
  };

  const getTimeRemaining = (predictionTimestamp: number) => {  
    const elapsed = Date.now() - predictionTimestamp;  
    const remaining = 15 * 60 * 1000 - elapsed;  
    if (remaining <= 0) return "Grading...";  
    const mins = Math.floor(remaining / 60000);  
    const secs = Math.floor((remaining % 60000) / 1000);  
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;  
  };

  const getStatusClass = (status: string) => {  
    switch (status) {  
      case "WIN":  
        return "status-win";  
      case "LOSS":  
        return "status-loss";  
      case "PENDING":  
        return "status-pending";  
      default:  
        return "status-pending";  
    }  
  };

  // ============================================  
  // HANDLERS  
  // ============================================

  function handleTargetSubmit() {  
    const val = parseFloat(targetPriceInput);  
    if (!isNaN(val) && val > 0) {  
      setTargetPrice(val);  
    }  
  }

  function handleTargetKeyDown(e: React.KeyboardEvent) {  
    if (e.key === "Enter") handleTargetSubmit();  
  }

  function clearTarget() {  
    setTargetPrice(null);  
    setTargetPriceInput("");  
  }

  function handleKalshiPricesSubmit() {  
    const up = parseFloat(kalshiUpInput);  
    const down = parseFloat(kalshiDownInput);  
    if (!isNaN(up) && up >= 0 && up <= 100) setKalshiUp(up);  
    if (!isNaN(down) && down >= 0 && down <= 100) setKalshiDown(down);  
  }

  function clearKalshiPrices() {  
    setKalshiUp(null);  
    setKalshiDown(null);  
    setKalshiUpInput("");  
    setKalshiDownInput("");  
  }

  function handleKalshiSubmit() {  
    const val = parseFloat(kalshiYesInput);  
    if (!isNaN(val) && val >= 0 && val <= 100) setKalshiYes(val);  
  }

  function handleKalshiKeyDown(e: React.KeyboardEvent) {  
    if (e.key === "Enter") handleKalshiSubmit();  
  }

  function clearKalshi() {  
    setKalshiYes(null);  
    setKalshiYesInput("");  
  }

  function handleBankrollSubmit() {  
    const val = parseFloat(bankrollInput);  
    if (!isNaN(val) && val > 0) setBankroll(val);  
  }

  function handleBankrollKeyDown(e: React.KeyboardEvent) {  
    if (e.key === "Enter") handleBankrollSubmit();  
  }

  function refreshKalshi() {  
    loadKalshiData();  
  }

  function savePrediction() {  
    if (btcPrice === null) return;

    const newPrediction: PredictionRecord = {  
      id: Date.now(),  
      time: new Date().toLocaleTimeString(),  
      signal:  
        targetPrice !== null  
          ? targetPrediction.side === "UP"  
            ? "ABOVE ⬆"  
            : targetPrediction.side === "DOWN"  
            ? "BELOW ⬇"  
            : "SKIP ⏭"  
          : prediction,  
      confidence:  
        targetPrice !== null ? targetPrediction.confidence : confidence,  
      initialPrice: btcPrice,  
      predictionTimestamp: Date.now(),  
      status: "PENDING",  
      kalshiYes:  
        kalshiUp !== null  
          ? kalshiUp  
          : kalshiYes !== null  
          ? kalshiYes  
          : undefined,  
      kalshiNo: kalshiDown !== null ? kalshiDown : undefined,  
      edge:  
        recommendation.edge !== null  
          ? recommendation.edge  
          : kalshiEdge !== null  
          ? kalshiEdge  
          : undefined,  
      confluenceScore,  
      recommendedBet: recommendedBet !== null ? recommendedBet : undefined,  
      entryAction: recommendation.action,  
      targetPrice: targetPrice !== null ? targetPrice : undefined,  
      betSide: recommendation.betSide,  
    };

    setJournal((prev) => [newPrediction, ...prev]);  
  }

  function exportCSV() {  
    if (journal.length === 0) return;

    const headers = [  
      "Time",  
      "Signal",  
      "Confidence",  
      "Entry Price (USD)",  
      "Exit Price (USD)",  
      "Target Price",  
      "Bet Side",  
      "Kalshi Up ¢",  
      "Kalshi Down ¢",  
      "Edge %",  
      "Confluence %",  
      "Entry Action",  
      "Recommended Bet ($)",  
      "Status",  
      "Prediction Timestamp (ISO)",  
      "Graded Timestamp (ISO)",  
    ];

    const rows = journal.map((entry) => [  
      entry.time,  
      entry.signal,  
      entry.confidence.toString(),  
      entry.initialPrice.toFixed(2),  
      entry.finalPrice ? entry.finalPrice.toFixed(2) : "—",  
      entry.targetPrice ? entry.targetPrice.toFixed(2) : "—",  
      entry.betSide || "—",  
      entry.kalshiYes !== undefined ? entry.kalshiYes.toString() : "—",  
      entry.kalshiNo !== undefined ? entry.kalshiNo.toString() : "—",  
      entry.edge !== undefined ? entry.edge.toString() : "—",  
      entry.confluenceScore !== undefined  
        ? entry.confluenceScore.toString()  
        : "—",  
      entry.entryAction || "—",  
      entry.recommendedBet !== undefined  
        ? entry.recommendedBet.toFixed(2)  
        : "—",  
      entry.status,  
      new Date(entry.predictionTimestamp).toISOString(),  
      entry.gradedTimestamp  
        ? new Date(entry.gradedTimestamp).toISOString()  
        : "—",  
    ]);

    const csv = [  
      headers.map((h) => `"${h}"`).join(","),  
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),  
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });  
    const link = document.createElement("a");  
    link.href = URL.createObjectURL(blob);  
    link.download = "CryptoRPM_Journal.csv";  
    document.body.appendChild(link);  
    link.click();  
    document.body.removeChild(link);  
    URL.revokeObjectURL(link.href);  
  }

  function clearJournal() {  
    if (  
      window.confirm(  
        "Are you sure you want to clear all journal entries? This action cannot be undone."  
      )  
    ) {  
      setJournal([]);  
    }  
  }

  const filteredJournal = journal.filter((entry) => {  
    if (journalFilter === "ALL") return true;  
    return entry.status === journalFilter;  
  });

  // ============================================  
  // RENDER  
  // ============================================

  return (  
    <div className="app">  
      {gradingMessage && (  
        <div className="grading-toast">  
          <CheckCircle2 size={18} />  
          {gradingMessage}  
        </div>  
      )}

      <header>  
        <h1>🚗 CryptoRPM</h1>  
        <p className="subtitle">Bitcoin 15-Minute Prediction Engine</p>  
      </header>

      {/* KALSHI API STATUS BAR */}  
      <div  
        className={`kalshi-status-bar ${  
          kalshiConnected ? "kalshi-connected" : "kalshi-disconnected"  
        }`}  
      >  
        <div className="kalshi-status-left">  
          {kalshiConnected ? <Wifi size={16} /> : <WifiOff size={16} />}  
          <span className="kalshi-status-text">  
            {kalshiConnected  
              ? `KALSHI LIVE — ${kalshiMarketTicker}`  
              : "KALSHI DISCONNECTED"}  
          </span>  
          {kalshiConnected && kalshiCloseTime && (  
            <span className="kalshi-close-time">  
              Closes: {kalshiCloseTime}  
            </span>  
          )}  
        </div>  
        <div className="kalshi-status-right">  
          {kalshiLastUpdate && (  
            <span className="kalshi-last-update">  
              Updated: {kalshiLastUpdate}  
            </span>  
          )}  
          <button  
            className="kalshi-refresh-btn"  
            onClick={refreshKalshi}  
            title="Refresh Kalshi data"  
          >  
            <RefreshCw size={14} />  
          </button>  
        </div>  
      </div>

      {kalshiError && !kalshiConnected && (  
        <div className="kalshi-error-banner">  
          <AlertTriangle size={16} />  
          <span>{kalshiError}</span>  
          <span className="kalshi-error-hint">  
            You can still enter prices manually below.  
          </span>  
        </div>  
      )}

      {/* KALSHI TARGET MODE */}  
      <div className="target-panel">  
        <div className="target-header">  
          <Crosshair size={22} />  
          <h2>Kalshi Target Mode</h2>  
          <span className="target-badge">  
            {kalshiConnected ? "AUTO" : "MANUAL"} • BTC 15 MIN  
          </span>  
        </div>

        <div className="target-body">  
          <div className="target-input-section">  
            <div className="target-input-group">  
              <label>  
                TO BEAT (Kalshi Target Price)  
                {kalshiConnected && (  
                  <span className="auto-label">  
                    {" "}  
                    — Auto-filled from Kalshi  
                  </span>  
                )}  
              </label>  
              <div className="target-input-row">  
                <div className="target-input-wrapper">  
                  <DollarSign size={18} className="input-icon" />  
                  <input  
                    type="number"  
                    step="0.01"  
                    placeholder="e.g. 66718.03"  
                    value={targetPriceInput}  
                    onChange={(e) => setTargetPriceInput(e.target.value)}  
                    onKeyDown={handleTargetKeyDown}  
                    className="target-input"  
                  />  
                </div>  
                <button  
                  className="target-set-btn"  
                  onClick={handleTargetSubmit}  
                  disabled={  
                    targetPriceInput === "" ||  
                    isNaN(parseFloat(targetPriceInput))  
                  }  
                >  
                  Set Target  
                </button>  
                {targetPrice !== null && (  
                  <button className="target-clear-btn" onClick={clearTarget}>  
                    Clear  
                  </button>  
                )}  
              </div>  
            </div>

            <div className="kalshi-prices-group">  
              <label>  
                Kalshi Prices (¢)  
                {kalshiConnected && (  
                  <span className="auto-label"> — Live from API</span>  
                )}  
              </label>  
              <div className="kalshi-prices-row">  
                <div className="kalshi-price-input-wrap">  
                  <ArrowUp size={14} className="input-icon-sm green" />  
                  <input  
                    type="number"  
                    min="0"  
                    max="100"  
                    step="1"  
                    placeholder="Up ¢"  
                    value={kalshiUpInput}  
                    onChange={(e) => setKalshiUpInput(e.target.value)}  
                    className="kalshi-price-input up-input"  
                  />  
                </div>  
                <div className="kalshi-price-input-wrap">  
                  <ArrowDown size={14} className="input-icon-sm red" />  
                  <input  
                    type="number"  
                    min="0"  
                    max="100"  
                    step="1"  
                    placeholder="Down ¢"  
                    value={kalshiDownInput}  
                    onChange={(e) => setKalshiDownInput(e.target.value)}  
                    className="kalshi-price-input down-input"  
                  />  
                </div>  
                <button  
                  className="kalshi-prices-set-btn"  
                  onClick={handleKalshiPricesSubmit}  
                >  
                  Set  
                </button>  
                {(kalshiUp !== null || kalshiDown !== null) && (  
                  <button  
                    className="kalshi-prices-clear-btn"  
                    onClick={clearKalshiPrices}  
                  >  
                    ✕  
                  </button>  
                )}  
              </div>  
            </div>  
          </div>

          {/* Main Target Display */}  
          {targetPrice !== null && (  
            <div className="target-display">  
              <div className="target-display-grid">  
                <div className="target-info-card">  
                  <span className="target-info-label">TO BEAT</span>  
                  <h2 className="target-info-value">  
                    $  
                    {targetPrice.toLocaleString(undefined, {  
                      minimumFractionDigits: 2,  
                      maximumFractionDigits: 2,  
                    })}  
                  </h2>  
                  <span className="target-info-sub">Target Price</span>  
                </div>

                <div className="target-info-card">  
                  <span className="target-info-label">NOW</span>  
                  <h2  
                    className={`target-info-value price-flash-${priceDirection}`}  
                  >  
                    $  
                    {btcPrice.toLocaleString(undefined, {  
                      minimumFractionDigits: 2,  
                      maximumFractionDigits: 2,  
                    })}  
                  </h2>  
                  <span  
                    className={`target-info-sub ${  
                      isAboveTarget ? "text-green" : "text-red"  
                    }`}  
                  >  
                    {distanceDollar !== null && distancePercent !== null  
                      ? `${  
                          distanceDollar >= 0 ? "+" : ""  
                        }$${distanceDollar.toFixed(2)} (${  
                          distancePercent >= 0 ? "+" : ""  
                        }${distancePercent.toFixed(3)}%)`  
                      : "—"}  
                  </span>  
                </div>

                <div className="target-info-card">  
                  <span className="target-info-label">COUNTDOWN</span>  
                  <h2 className="target-info-value countdown-value">  
                    {timeLeft}  
                  </h2>  
                  <span className="target-info-sub">Until Expiry</span>  
                </div>  
              </div>

              {/* Distance Bar */}  
              <div className="distance-bar-section">  
                <div className="distance-bar-label">  
                  <span  
                    className={isAboveTarget ? "text-green" : "text-red"}  
                  >  
                    {isAboveTarget ? "ABOVE TARGET ⬆" : "BELOW TARGET ⬇"}  
                  </span>  
                  <span  
                    className={`momentum-badge momentum-${momentum.direction}`}  
                  >  
                    <Navigation size={12} />  
                    {momentum.label} • {momentum.speed}  
                  </span>  
                </div>  
                <div className="distance-bar-track">  
                  <div className="distance-bar-center" />  
                  <div  
                    className={`distance-bar-fill ${  
                      isAboveTarget ? "fill-above" : "fill-below"  
                    }`}  
                    style={{  
                      width: `${Math.min(  
                        50,  
                        Math.abs(distancePercent || 0) * 100  
                      )}%`,  
                      [isAboveTarget ? "left" : "right"]: "50%",  
                    }}  
                  />  
                  <div className="distance-bar-marker" />  
                </div>  
                <div className="distance-bar-ends">  
                  <span>Below</span>  
                  <span>${targetPrice.toLocaleString()}</span>  
                  <span>Above</span>  
                </div>  
              </div>

              {/* Kalshi Up/Down Display */}  
              {(kalshiUp !== null || kalshiDown !== null) && (  
                <div className="kalshi-odds-display">  
                  <div  
                    className={`kalshi-odds-card ${  
                      recommendation.betSide === "UP"  
                        ? "odds-highlighted"  
                        : ""  
                    }`}  
                  >  
                    <span className="odds-label">Up</span>  
                    <h3 className="odds-value odds-up">  
                      {kalshiUp !== null ? `${kalshiUp}¢` : "—"}  
                    </h3>  
                  </div>  
                  <div className="odds-divider">vs</div>  
                  <div  
                    className={`kalshi-odds-card ${  
                      recommendation.betSide === "DOWN"  
                        ? "odds-highlighted"  
                        : ""  
                    }`}  
                  >  
                    <span className="odds-label">Down</span>  
                    <h3 className="odds-value odds-down">  
                      {kalshiDown !== null ? `${kalshiDown}¢` : "—"}  
                    </h3>  
                  </div>  
                </div>  
              )}

              {/* Recommendation */}  
              <div  
                className={`recommendation-card ${recommendation.color}`}  
              >  
                <div className="rec-main">  
                  {recommendation.betSide === "UP" ? (  
                    <ArrowUp size={28} />  
                  ) : recommendation.betSide === "DOWN" ? (  
                    <ArrowDown size={28} />  
                  ) : (  
                    <SkipForward size={28} />  
                  )}  
                  <div className="rec-content">  
                    <h3 className="rec-action">{recommendation.action}</h3>  
                    <p className="rec-explanation">  
                      {recommendation.explanation}  
                    </p>  
                  </div>  
                </div>

                {recommendation.edge !== null && (  
                  <div className="rec-stats">  
                    <div className="rec-stat">  
                      <span>Edge</span>  
                      <strong  
                        className={  
                          recommendation.edge > 0  
                            ? "edge-positive"  
                            : "edge-negative"  
                        }  
                      >  
                        {recommendation.edge > 0 ? "+" : ""}  
                        {Math.round(recommendation.edge)}%  
                      </strong>  
                    </div>  
                    <div className="rec-stat">  
                      <span>Confidence</span>  
                      <strong>{targetPrediction.confidence}%</strong>  
                    </div>  
                    {recommendedBet !== null &&  
                      recommendation.betSide !== "SKIP" && (  
                        <div className="rec-stat">  
                          <span>Bet Size</span>  
                          <strong>${recommendedBet.toFixed(2)}</strong>  
                        </div>  
                      )}  
                    {evPerTrade !== null &&  
                      recommendation.betSide !== "SKIP" && (  
                        <div className="rec-stat">  
                          <span>EV/Trade</span>  
                          <strong  
                            className={  
                              evPerTrade >= 0  
                                ? "edge-positive"  
                                : "edge-negative"  
                            }  
                          >  
                            {evPerTrade >= 0 ? "+" : ""}  
                            {evPerTrade}¢  
                          </strong>  
                        </div>  
                      )}  
                  </div>  
                )}  
              </div>

              {/* Save Button */}  
              <div className="target-save-row">  
                <button  
                  className="save-prediction-btn"  
                  onClick={savePrediction}  
                  disabled={recommendation.betSide === "SKIP"}  
                >  
                  {recommendation.betSide === "SKIP"  
                    ? "No Trade to Save"  
                    : `Save: ${  
                        recommendation.betSide  
                      } @ $${btcPrice.toLocaleString()}`}  
                </button>  
              </div>  
            </div>  
          )}

          {targetPrice === null && (  
            <div className="target-placeholder">  
              <Crosshair size={40} />  
              <h3>  
                {kalshiConnected  
                  ? "Loading target from Kalshi..."  
                  : 'Enter the Kalshi "TO BEAT" price'}  
              </h3>  
              <p>  
                {kalshiConnected  
                  ? "Target price will auto-fill from the next active contract"  
                  : "Copy the target price from your Kalshi BTC 15-min contract above to get started"}  
              </p>  
            </div>  
          )}  
        </div>  
      </div>

      {/* LIVE CHART */}  
      <div className="chart-card">  
        <div className="live-chart-header">  
          <span className="live-dot" />  
          <span className="live-chart-title">LIVE</span>  
          <span className="live-chart-points">  
            {liveChartData.length} points  
          </span>  
        </div>  
        <ResponsiveContainer  
          width="100%"  
          height={window.innerWidth < 768 ? 250 : 450}  
        >  
          <LineChart  
            data={liveChartData.length > 2 ? liveChartData : chartData}  
          >  
            <XAxis  
              dataKey="time"  
              stroke="#555"  
              tick={{ fontSize: 10 }}  
              interval="preserveStartEnd"  
            />  
            <YAxis  
              domain={["dataMin - 20", "dataMax + 20"]}  
              stroke="#555"  
              tick={{ fontSize: 11 }}  
            />  
            <Tooltip  
              contentStyle={{  
                background: "#1a1a1a",  
                border: "1px solid #333",  
                borderRadius: "10px",  
                color: "#fff",  
              }}  
              labelStyle={{ color: "#f7931a" }}  
            />  
            {targetPrice !== null && (  
              <ReferenceLine  
                y={targetPrice}  
                stroke="#ff4d4d"  
                strokeDasharray="8 4"  
                strokeWidth={2}  
                label={{  
                  value: `Target: $${targetPrice.toLocaleString()}`,  
                  fill: "#ff4d4d",  
                  fontSize: 12,  
                  position: "insideTopRight",  
                }}  
              />  
            )}  
            <Line  
              type="monotone"  
              dataKey="price"  
              stroke="#f7931a"  
              strokeWidth={3}  
              dot={false}  
              isAnimationActive={false}  
              activeDot={{  
                r: 5,  
                fill: "#f7931a",  
                stroke: "#fff",  
                strokeWidth: 2,  
              }}  
            />  
          </LineChart>  
        </ResponsiveContainer>  
      </div>

      {/* MARKET PANEL */}  
      <div className="market-panel">  
        <div className="main-market">  
          <p className="question">TREND DIRECTION</p>  
          <div  
            className={`prediction-main ${  
              prediction.includes("UP")  
                ? "prediction-up"  
                : "prediction-down"  
            }`}  
          >  
            {prediction}  
          </div>  
          <div className={`btc-price price-flash-${priceDirection}`}>  
            ${btcPrice.toLocaleString()}  
          </div>  
          <div className="countdown">  
            <Clock3 size={18} />  
            {timeLeft}  
          </div>  
          <div className="button-row">  
            <button  
              className="save-btn"  
              onClick={savePrediction}  
              disabled={btcPrice === null}  
            >  
              Save Prediction  
            </button>  
            <button  
              className="export-btn"  
              onClick={exportCSV}  
              disabled={journal.length === 0}  
            >  
              Export CSV  
            </button>  
            <button  
              className="clear-btn"  
              onClick={clearJournal}  
              disabled={journal.length === 0}  
            >  
              Clear Journal  
            </button>  
          </div>  
          {pendingCount > 0 && (  
            <div className="auto-grade-banner">  
              <Hourglass size={16} />  
              <span>  
                {pendingCount} prediction  
                {pendingCount > 1 ? "s" : ""} awaiting auto-grade  
              </span>  
            </div>  
          )}  
        </div>  
        <div className="side-market">  
          <div className="yes-box">  
            YES  
            <h2>{confidence}%</h2>  
          </div>  
          <div className="no-box">  
            NO  
            <h2>{100 - confidence}%</h2>  
          </div>  
        </div>  
      </div>

      {/* MULTI-TIMEFRAME CONFLUENCE */}  
      <div className="confluence-panel">  
        <div className="confluence-header">  
          <Layers size={22} />  
          <h2>Multi-Timeframe Confluence</h2>  
          <div className="confluence-star-rating">  
            {Array.from({ length: 5 }).map((_, i) => (  
              <Star  
                key={i}  
                size={18}  
                className={  
                  i < starRating ? "star-filled" : "star-empty"  
                }  
                fill={i < starRating ? "#ffd700" : "none"}  
              />  
            ))}  
          </div>  
        </div>

        <div className="timeframe-grid">  
          {allSignals.map((signal) => (  
            <div  
              key={signal.period}  
              className={`timeframe-card tf-${signal.direction.toLowerCase()}`}  
            >  
              <div className="tf-label">{signal.label}</div>  
              <div  
                className={`tf-direction tf-dir-${signal.direction.toLowerCase()}`}  
              >  
                {signal.direction === "UP" ? (  
                  <ChevronUp size={20} />  
                ) : (  
                  <ChevronDown size={20} />  
                )}  
                {signal.direction}{" "}  
                {signal.direction === "UP" ? "⬆" : "⬇"}  
              </div>  
              <div className="tf-confidence">{signal.confidence}%</div>  
              <div  
                className={`tf-change ${  
                  signal.change >= 0  
                    ? "tf-change-up"  
                    : "tf-change-down"  
                }`}  
              >  
                {signal.change >= 0 ? "+" : ""}  
                {signal.change.toFixed(3)}%  
              </div>  
            </div>  
          ))}  
        </div>

        <div className="confluence-summary">  
          <div className="confluence-meter">  
            <div className="confluence-meter-label">  
              <span>BEARISH</span>  
              <span>BULLISH</span>  
            </div>  
            <div className="confluence-meter-track">  
              <div  
                className="confluence-meter-fill"  
                style={{  
                  width: `${confluenceScore}%`,  
                  background:  
                    confluenceScore >= 75  
                      ? "#00ff88"  
                      : confluenceScore >= 50  
                      ? "#f7931a"  
                      : "#ff4d4d",  
                }}  
              />  
              <div  
                className="confluence-meter-marker"  
                style={{ left: `${confluenceScore}%` }}  
              />  
            </div>  
          </div>

          <div className="confluence-stats">  
            <div className="confluence-stat">  
              <span className="cs-label">Confluence</span>  
              <span  
                className={`cs-value cs-${  
                  confluenceScore >= 75  
                    ? "bull"  
                    : confluenceScore >= 50  
                    ? "neutral"  
                    : "bear"  
                }`}  
              >  
                {confluenceScore}%  
              </span>  
            </div>  
            <div className="confluence-stat">  
              <span className="cs-label">Verdict</span>  
              <span className="cs-value">{confluenceLabel}</span>  
            </div>  
            <div className="confluence-stat">  
              <span className="cs-label">Bullish</span>  
              <span className="cs-value">  
                {bullishCount}/{allSignals.length}  
              </span>  
            </div>  
            <div className="confluence-stat">  
              <span className="cs-label">Fair Value</span>  
              <span className="cs-value">{fairValue}%</span>  
            </div>  
          </div>  
        </div>  
      </div>

      {/* SMART ENTRY SIGNAL */}  
      <div className="entry-signal-panel">  
        <div className="entry-header">  
          <Target size={22} />  
          <h2>Smart Entry Signal</h2>  
        </div>

        <div className="entry-body">  
          <div  
            className={`entry-action-badge ${getActionColor(  
              entrySignal.action  
            )}`}  
          >  
            {entrySignal.action.includes("BUY YES") ||  
            entrySignal.action.includes("LEAN YES") ? (  
              <ChevronUp size={28} />  
            ) : entrySignal.action.includes("BUY NO") ||  
              entrySignal.action.includes("LEAN NO") ? (  
              <ChevronDown size={28} />  
            ) : (  
              <Minus size={28} />  
            )}  
            <span className="entry-action-text">  
              {entrySignal.action}  
            </span>  
          </div>

          <div className="entry-kalshi-input">  
            <label htmlFor="kalshi-input">  
              Kalshi YES price (¢ or %)  
            </label>  
            <div className="kalshi-input-row">  
              <input  
                id="kalshi-input"  
                type="number"  
                min="0"  
                max="100"  
                step="1"  
                placeholder="e.g. 32"  
                value={kalshiYesInput}  
                onChange={(e) => setKalshiYesInput(e.target.value)}  
                onKeyDown={handleKalshiKeyDown}  
                className="kalshi-input"  
              />  
              <button  
                className="kalshi-set-btn"  
                onClick={handleKalshiSubmit}  
                disabled={  
                  kalshiYesInput === "" ||  
                  isNaN(parseFloat(kalshiYesInput)) ||  
                  parseFloat(kalshiYesInput) < 0 ||  
                  parseFloat(kalshiYesInput) > 100  
                }  
              >  
                Set  
              </button>  
              {kalshiYes !== null && (  
                <button  
                  className="kalshi-clear-btn"  
                  onClick={clearKalshi}  
                >  
                  Clear  
                </button>  
              )}  
            </div>  
          </div>

          <div className="entry-details-grid">  
            <div className="entry-detail">  
              <p className="ed-label">Fair Value</p>  
              <h3 className="ed-value">{fairValue}%</h3>  
            </div>  
            <div className="entry-detail">  
              <p className="ed-label">Kalshi YES</p>  
              <h3  
                className={`ed-value ${  
                  kalshiYes !== null ? "" : "dim"  
                }`}  
              >  
                {kalshiYes !== null ? `${kalshiYes}¢` : "—"}  
              </h3>  
            </div>  
            <div className="entry-detail">  
              <p className="ed-label">Edge</p>  
              <h3  
                className={`ed-value ${  
                  kalshiEdge !== null  
                    ? kalshiEdge > 0  
                      ? "edge-positive"  
                      : kalshiEdge < 0  
                      ? "edge-negative"  
                      : ""  
                    : "dim"  
                }`}  
              >  
                {kalshiEdge !== null  
                  ? `${kalshiEdge > 0 ? "+" : ""}${Math.round(  
                      kalshiEdge  
                    )}%`  
                  : "—"}  
              </h3>  
            </div>  
            <div className="entry-detail">  
              <p className="ed-label">Confluence</p>  
              <h3 className="ed-value">{confluenceScore}%</h3>  
            </div>

            {kalshiYes !== null && (  
              <>  
                <div className="entry-detail entry-profit">  
                  <p className="ed-label">Potential Profit</p>  
                  <h3 className="ed-value edge-positive">  
                    +{entrySignal.potentialProfit}¢  
                  </h3>  
                </div>  
                <div className="entry-detail entry-loss">  
                  <p className="ed-label">Potential Loss</p>  
                  <h3 className="ed-value edge-negative">  
                    -{entrySignal.potentialLoss}¢  
                  </h3>  
                </div>  
                <div className="entry-detail">  
                  <p className="ed-label">Risk / Reward</p>  
                  <h3 className="ed-value">  
                    1 : {entrySignal.riskReward?.toFixed(2)}  
                  </h3>  
                </div>  
                {kalshiEdge !== null && (  
                  <div className="entry-detail">  
                    <p className="ed-label">Edge Verdict</p>  
                    <span  
                      className={`edge-verdict-badge verdict-${  
                        getEdgeVerdict(kalshiEdge).tier  
                      }`}  
                    >  
                      {getEdgeVerdict(kalshiEdge).label}  
                    </span>  
                  </div>  
                )}  
              </>  
            )}  
          </div>

          {kalshiEdge !== null && (  
            <div className="entry-edge-bar">  
              <div className="edge-bar-labels">  
                <span>Kalshi {kalshiYes}%</span>  
                <span>Fair Value {fairValue}%</span>  
              </div>  
              <div className="edge-bar-track">  
                <div  
                  className="edge-bar-kalshi"  
                  style={{ width: `${kalshiYes}%` }}  
                />  
                <div  
                  className="edge-bar-rpm"  
                  style={{ width: `${fairValue}%` }}  
                />  
              </div>  
              <p className="edge-direction-text">  
                {getEdgeDirection(kalshiEdge)}  
              </p>  
            </div>  
          )}  
        </div>  
      </div>

      {/* BANKROLL MANAGER */}  
      <div className="bankroll-panel">  
        <div className="bankroll-header">  
          <Wallet size={22} />  
          <h2>Bankroll Manager</h2>  
          <span className="bankroll-badge">Kelly Criterion</span>  
        </div>

        <div className="bankroll-body">  
          <div className="bankroll-input-section">  
            <label htmlFor="bankroll-input">  
              Your Trading Bankroll ($)  
            </label>  
            <div className="bankroll-input-row">  
              <div className="bankroll-input-wrapper">  
                <DollarSign size={18} className="bankroll-input-icon" />  
                <input  
                  id="bankroll-input"  
                  type="number"  
                  min="1"  
                  step="1"  
                  placeholder="e.g. 500"  
                  value={bankrollInput}  
                  onChange={(e) => setBankrollInput(e.target.value)}  
                  onKeyDown={handleBankrollKeyDown}  
                  className="bankroll-input"  
                />  
              </div>  
              <button  
                className="bankroll-set-btn"  
                onClick={handleBankrollSubmit}  
                disabled={  
                  bankrollInput === "" ||  
                  isNaN(parseFloat(bankrollInput)) ||  
                  parseFloat(bankrollInput) <= 0  
                }  
              >  
                Set  
              </button>  
            </div>  
          </div>

          {bankroll !== null && (  
            <>  
              <div className="bankroll-stats-grid">  
                <div className="bankroll-stat-card">  
                  <PiggyBank size={20} />  
                  <p>Bankroll</p>  
                  <h3>${bankroll.toLocaleString()}</h3>  
                </div>  
                <div className="bankroll-stat-card">  
                  <Activity size={20} />  
                  <p>Win Rate</p>  
                  <h3>{Math.round(winRate * 100)}%</h3>  
                </div>  
                <div className="bankroll-stat-card">  
                  <TrendingUp size={20} />  
                  <p>Kelly %</p>  
                  <h3>{(kellyFraction * 100).toFixed(1)}%</h3>  
                </div>  
                <div className="bankroll-stat-card">  
                  <TrendingDown size={20} />  
                  <p>Half Kelly %</p>  
                  <h3>{(halfKelly * 100).toFixed(1)}%</h3>  
                </div>  
              </div>

              <div className="bet-recommendation">  
                <div className="bet-rec-main">  
                  <div className="bet-rec-icon">  
                    <CircleDollarSign size={36} />  
                  </div>  
                  <div className="bet-rec-content">  
                    <p className="bet-rec-label">  
                      RECOMMENDED BET (Half Kelly)  
                    </p>  
                    <h2 className="bet-rec-amount">  
                      $  
                      {recommendedBet !== null  
                        ? recommendedBet.toFixed(2)  
                        : "—"}  
                    </h2>  
                    <p className="bet-rec-pct">  
                      {bankroll  
                        ? `${(halfKelly * 100).toFixed(  
                            1  
                          )}% of bankroll`  
                        : ""}  
                    </p>  
                  </div>  
                </div>

                <div className="bet-rec-details">  
                  <div className="bet-detail">  
                    <span>Max Bet (Full Kelly)</span>  
                    <strong>  
                      ${maxBet !== null ? maxBet.toFixed(2) : "—"}  
                    </strong>  
                  </div>  
                  {evPerTrade !== null && (  
                    <div className="bet-detail">  
                      <span>EV per Contract</span>  
                      <strong  
                        className={  
                          evPerTrade >= 0  
                            ? "edge-positive"  
                            : "edge-negative"  
                        }  
                      >  
                        {evPerTrade >= 0 ? "+" : ""}  
                        {evPerTrade}¢  
                      </strong>  
                    </div>  
                  )}  
                  {evDollar !== null && (  
                    <div className="bet-detail">  
                      <span>EV per Trade ($)</span>  
                      <strong  
                        className={  
                          evDollar >= 0  
                            ? "edge-positive"  
                            : "edge-negative"  
                        }  
                      >  
                        {evDollar >= 0 ? "+$" : "-$"}  
                        {Math.abs(evDollar).toFixed(2)}  
                      </strong>  
                    </div>  
                  )}  
                  <div className="bet-detail">  
                    <span>Avg Win</span>  
                    <strong>+{Math.round(avgWin)}¢</strong>  
                  </div>  
                  <div className="bet-detail">  
                    <span>Avg Loss</span>  
                    <strong>-{Math.round(avgLoss)}¢</strong>  
                  </div>  
                </div>

                {kellyFraction <= 0 && (  
                  <div className="bet-warning">  
                    <AlertTriangle size={16} />  
                    <span>  
                      Kelly suggests no bet — your edge may not be  
                      positive. Build more history or find a better  
                      entry.  
                    </span>  
                  </div>  
                )}

                {wins + losses < 10 && (  
                  <div className="bet-info">  
                    <Brain size={16} />  
                    <span>  
                      Only {wins + losses} graded trades. Kelly becomes  
                      more accurate with 20+ trades. Using conservative  
                      defaults until then.  
                    </span>  
                  </div>  
                )}  
              </div>  
            </>  
          )}

          {bankroll === null && (  
            <div className="bankroll-placeholder">  
              <p>  
                Enter your bankroll above to get Kelly Criterion bet  
                sizing recommendations.  
              </p>  
            </div>  
          )}  
        </div>  
      </div>

      {/* STATS GRID */}  
      <div className="stats-grid">  
        <div className="stat-card">  
          <Gauge size={24} />  
          <h3>{rpm}</h3>  
          <p>RPM</p>  
        </div>  
        <div className="stat-card">  
          <TrendingUp size={24} />  
          <h3>{change.toFixed(2)}%</h3>  
          <p>Momentum</p>  
        </div>  
        <div className="stat-card">  
          <Target size={24} />  
          <h3>{confidence}%</h3>  
          <p>Confidence</p>  
        </div>  
        <div className="stat-card">  
          <Brain size={24} />  
          <h3>{signalStrength}%</h3>  
          <p>Strength</p>  
        </div>  
        <div className="stat-card">  
          <Shield size={24} />  
          <h3>{marketHealth}%</h3>  
          <p>Health</p>  
        </div>  
        <div className="stat-card">  
          <Zap size={24} />  
          <h3>{volatility}%</h3>  
          <p>Volatility</p>  
        </div>  
        <div className="stat-card">  
          <Activity size={24} />  
          <h3>LIVE</h3>  
          <p>Status</p>  
        </div>  
        <div className="stat-card">  
          <Shield size={24} />  
          <h3>{accuracy}%</h3>  
          <p>Accuracy</p>  
        </div>  
      </div>

      {/* PERFORMANCE DASHBOARD */}  
      <div className="overview-card">  
        <h2>Performance Dashboard</h2>  
        <div className="overview-grid">  
          <div>  
            <p>Wins</p>  
            <h3 className="overview-wins">{wins}</h3>  
          </div>  
          <div>  
            <p>Losses</p>  
            <h3 className="overview-losses">{losses}</h3>  
          </div>  
          <div>  
            <p>Accuracy</p>  
            <h3>{accuracy}%</h3>  
          </div>  
          <div>  
            <p>Total Calls</p>  
            <h3>{journal.length}</h3>  
          </div>  
          <div>  
            <p>  
              <Trophy size={18} /> Win Streak  
            </p>  
            <h3 className="overview-streak">{winStreak}</h3>  
          </div>  
          <div>  
            <p>  
              <Hourglass size={18} /> Pending  
            </p>  
            <h3 className="overview-pending">{pendingCount}</h3>  
          </div>  
          {edgePredictions.length > 0 && (  
            <>  
              <div>  
                <p>  
                  <BarChart3 size={18} /> Edge Accuracy  
                </p>  
                <h3 className="overview-edge">{edgeAccuracy}%</h3>  
              </div>  
              <div>  
                <p>  
                  <ArrowRightLeft size={18} /> Avg Edge  
                </p>  
                <h3 className="overview-edge">{avgEdge}%</h3>  
              </div>  
            </>  
          )}  
        </div>  
      </div>

      {/* PREDICTION JOURNAL */}  
      <div className="journal-card">  
        <div className="journal-header">  
          <h2>Prediction Journal</h2>  
          <div className="journal-controls">  
            <div className="journal-filters">  
              <button  
                className={journalFilter === "ALL" ? "active" : ""}  
                onClick={() => setJournalFilter("ALL")}  
              >  
                All ({journal.length})  
              </button>  
              <button  
                className={`filter-win ${  
                  journalFilter === "WIN" ? "active" : ""  
                }`}  
                onClick={() => setJournalFilter("WIN")}  
              >  
                Wins ({wins})  
              </button>  
              <button  
                className={`filter-loss ${  
                  journalFilter === "LOSS" ? "active" : ""  
                }`}  
                onClick={() => setJournalFilter("LOSS")}  
              >  
                Losses ({losses})  
              </button>  
              <button  
                className={`filter-pending ${  
                  journalFilter === "PENDING" ? "active" : ""  
                }`}  
                onClick={() => setJournalFilter("PENDING")}  
              >  
                Pending ({pendingCount})  
              </button>  
            </div>  
          </div>  
        </div>

        <div className="journal-table-wrapper">  
          <table>  
            <thead>  
              <tr>  
                <th>Time</th>  
                <th>Signal</th>  
                <th>Target</th>  
                <th>Entry $</th>  
                <th>Exit $</th>  
                <th>Side</th>  
                <th>Up/Down ¢</th>  
                <th>Edge</th>  
                <th>Bet $</th>  
                <th>Status</th>  
                <th>Timer</th>  
              </tr>  
            </thead>  
            <tbody>  
              {filteredJournal.length > 0 ? (  
                filteredJournal.map((entry) => (  
                  <tr  
                    key={entry.id}  
                    className={`journal-row-${entry.status.toLowerCase()}`}  
                  >  
                    <td>{entry.time}</td>  
                    <td  
                      className={  
                        entry.signal.includes("ABOVE") ||  
                        entry.signal.includes("UP")  
                          ? "signal-up"  
                          : entry.signal.includes("BELOW") ||  
                            entry.signal.includes("DOWN")  
                          ? "signal-down"  
                          : ""  
                      }  
                    >  
                      {entry.signal}  
                    </td>  
                    <td>  
                      {entry.targetPrice  
                        ? `$${entry.targetPrice.toLocaleString()}`  
                        : "—"}  
                    </td>  
                    <td>${entry.initialPrice.toLocaleString()}</td>  
                    <td>  
                      {entry.finalPrice  
                        ? `$${entry.finalPrice.toLocaleString()}`  
                        : "—"}  
                    </td>  
                    <td>  
                      {entry.betSide ? (  
                        <span  
                          className={`side-badge side-${entry.betSide.toLowerCase()}`}  
                        >  
                          {entry.betSide}  
                        </span>  
                      ) : (  
                        "—"  
                      )}  
                    </td>  
                    <td>  
                      {entry.kalshiYes !== undefined ||  
                      entry.kalshiNo !== undefined  
                        ? `${entry.kalshiYes ?? "—"}/${  
                            entry.kalshiNo ?? "—"  
                          }`  
                        : "—"}  
                    </td>  
                    <td>  
                      {entry.edge !== undefined ? (  
                        <span  
                          className={`edge-cell ${  
                            entry.edge > 0  
                              ? "edge-cell-positive"  
                              : entry.edge < 0  
                              ? "edge-cell-negative"  
                              : "edge-cell-neutral"  
                          }`}  
                        >  
                          {entry.edge > 0 ? "+" : ""}  
                          {Math.round(entry.edge)}%  
                        </span>  
                      ) : (  
                        "—"  
                      )}  
                    </td>  
                    <td>  
                      {entry.recommendedBet !== undefined  
                        ? `$${entry.recommendedBet.toFixed(2)}`  
                        : "—"}  
                    </td>  
                    <td>  
                      <span className={getStatusClass(entry.status)}>  
                        {entry.status}  
                      </span>  
                    </td>  
                    <td className="countdown-cell">  
                      {entry.status === "PENDING" ? (  
                        <PendingCountdown  
                          predictionTimestamp={  
                            entry.predictionTimestamp  
                          }  
                          getTimeRemaining={getTimeRemaining}  
                        />  
                      ) : (  
                        <span className="graded-check">✓</span>  
                      )}  
                    </td>  
                  </tr>  
                ))  
              ) : (  
                <tr>  
                  <td  
                    colSpan={11}  
                    style={{  
                      textAlign: "center",  
                      padding: "20px",  
                      color: "#888",  
                    }}  
                  >  
                    No entries to display for this filter.  
                  </td>  
                </tr>  
              )}  
            </tbody>  
          </table>  
        </div>  
      </div>  
    </div>  
  );  
}

// ============================================  
// PENDING COUNTDOWN COMPONENT  
// ============================================

function PendingCountdown({  
  predictionTimestamp,  
  getTimeRemaining,  
}: {  
  predictionTimestamp: number;  
  getTimeRemaining: (ts: number) => string;  
}) {  
  const [display, setDisplay] = useState(  
    getTimeRemaining(predictionTimestamp)  
  );

  useEffect(() => {  
    const timer = setInterval(() => {  
      setDisplay(getTimeRemaining(predictionTimestamp));  
    }, 1000);  
    return () => clearInterval(timer);  
  }, [predictionTimestamp, getTimeRemaining]);

  return <span className="pending-timer">{display}</span>;  
}

export default App;  