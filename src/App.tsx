import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
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
} from "lucide-react";

import "./App.css";

interface ChartPoint {
  time: string;
  price: number;
}

interface PredictionRecord {
  id: number;
  time: string;
  signal: string;
  confidence: number;
  price: number;
  status: string;
}

function App() {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [timeLeft, setTimeLeft] = useState("");

  const [journal, setJournal] = useState<PredictionRecord[]>(() => {
    const saved = localStorage.getItem("cryptoRPMJournal");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(
      "cryptoRPMJournal",
      JSON.stringify(journal)
    );
  }, [journal]);

  useEffect(() => {
    async function loadData() {
      try {
        const priceResponse = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
        );

        const priceData = await priceResponse.json();
        setBtcPrice(priceData.bitcoin.usd);

        const chartResponse = await fetch(
          "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1"
        );

        const chartJson = await chartResponse.json();

        const formatted = chartJson.prices
          .slice(-24)
          .map((item: number[]) => ({
            time: new Date(item[0]).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            price: Math.round(item[1]),
          }));

        setChartData(formatted);
      } catch (error) {
        console.error(error);
      }
    }

    loadData();

    const interval = setInterval(loadData, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();

      const next = new Date();

      next.setMinutes(
        Math.ceil(now.getMinutes() / 15) * 15
      );

      next.setSeconds(0);

      const diff = next.getTime() - now.getTime();

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setTimeLeft(
        `${mins}m ${secs
          .toString()
          .padStart(2, "0")}s`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!chartData.length) {
    return (
      <div className="loading">
        Loading CryptoRPM...
      </div>
    );
  }

  const firstPrice = chartData[0].price;
  const lastPrice =
    chartData[chartData.length - 1].price;

  const change =
    ((lastPrice - firstPrice) / firstPrice) * 100;

  const prediction =
    change >= 0 ? "UP ⬆" : "DOWN ⬇";

  const confidence = Math.min(
    95,
    Math.max(51, Math.round(55 + Math.abs(change) * 20))
  );

  const rpm = Math.max(
    1000,
    Math.min(
      9000,
      Math.round(5000 + change * 2500)
    )
  );

  const signalStrength = Math.round(
    (rpm / 9000) * 100
  );

  const marketHealth = Math.min(
    100,
    Math.round(confidence + signalStrength / 4)
  );

  const volatility = Math.round(
    Math.abs(change) * 20
  );

  const wins = journal.filter(
    (entry) => entry.status === "WIN"
  ).length;

  const losses = journal.filter(
    (entry) => entry.status === "LOSS"
  ).length;

  const accuracy =
    wins + losses === 0
      ? 0
      : Math.round(
          (wins / (wins + losses)) * 100
        );

  function savePrediction() {
    if (!btcPrice) return;

    const newPrediction: PredictionRecord = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      signal: prediction,
      confidence,
      price: btcPrice,
      status: "PENDING",
    };

    setJournal((prev) => [
      newPrediction,
      ...prev,
   ]);
}

function exportCSV() {
  if (journal.length === 0) return;

  const headers = [
    "Time",
    "Signal",
    "Confidence",
    "Price",
    "Status",
  ];

  const rows = journal.map((entry) => [
    entry.time,
    entry.signal,
    entry.confidence,
    entry.price,
    entry.status,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);

  link.download = "CryptoRPM_Journal.csv";

  link.click();
}

  function clearJournal() {
    setJournal([]);
  }

  function demoGrade() {
    if (!btcPrice) return;

    const statuses = ["WIN", "LOSS"];

    const randomStatus =
      statuses[
        Math.floor(Math.random() * statuses.length)
      ];

    setJournal((prev) => [
      {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        signal: prediction,
        confidence,
        price: btcPrice,
        status: randomStatus,
      },
      ...prev,
    ]);
  }

  return (
    <div className="app">
      <header>
        <h1>🚗 CryptoRPM</h1>
        <p className="subtitle">
          Bitcoin 15 Minute Prediction Engine
        </p>
      </header>

      <div className="market-panel">
        <div className="main-market">
          <p className="question">
            WILL BITCOIN BE HIGHER IN 15 MINUTES?
          </p>

          <div className="prediction-main">
            {prediction}
          </div>

          <div className="btc-price">
            ${btcPrice?.toLocaleString()}
          </div>

          <div className="countdown">
            <Clock3 size={18} />
            {timeLeft}
          </div>
<div className="button-row">
  <button
    className="save-btn"
    onClick={savePrediction}
  >
    Save Prediction
  </button>

  <button
    className="export-btn"
    onClick={exportCSV}
  >
    Export CSV
  </button>

  <button
    className="clear-btn"
    onClick={clearJournal}
  >
    Clear Journal
  </button>
</div>
        </div>

        <div className="side-market">
          <div className="yes-box">
            <span>YES</span>
            <h2>{confidence}%</h2>
          </div>

          <div className="no-box">
            <span>NO</span>
            <h2>{100 - confidence}%</h2>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <ResponsiveContainer
          width="100%"
          height={450}
        >
          <LineChart data={chartData}>
            <XAxis dataKey="time" />
            <YAxis domain={["dataMin", "dataMax"]} />
            <Tooltip />

            <Line
              type="monotone"
              dataKey="price"
              stroke="#f7931a"
              strokeWidth={4}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

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

      <div className="overview-card">
        <h2>Performance Dashboard</h2>

        <div className="overview-grid">
          <div>
            <p>Wins</p>
            <h3>{wins}</h3>
          </div>

          <div>
            <p>Losses</p>
            <h3>{losses}</h3>
          </div>

          <div>
            <p>Accuracy</p>
            <h3>{accuracy}%</h3>
          </div>

          <div>
            <p>Total Calls</p>
            <h3>{journal.length}</h3>
          </div>
        </div>
      </div>

      <div className="journal-card">
        <div className="journal-header">
          <h2>Prediction Journal</h2>

          <button
            className="demo-btn"
            onClick={demoGrade}
          >
            Demo Grade
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Signal</th>
              <th>Confidence</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {journal.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.time}</td>
                <td>{entry.signal}</td>
                <td>{entry.confidence}%</td>
                <td>
                  ${entry.price.toLocaleString()}
                </td>
                <td>{entry.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;