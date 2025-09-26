// src/components/ProductSalesChart.jsx
import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register ONCE (safe to run multiple times; ChartJS guards duplicates)
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function ProductSalesChart({ productSales = [] }) {
  const labels = useMemo(
    () => productSales.map((p) => p.name ?? "Unknown"),
    [productSales]
  );
  const quantities = useMemo(
    () => productSales.map((p) => Number(p.quantity ?? 0)),
    [productSales]
  );
  const totals = useMemo(
    () => productSales.map((p) => Number(p.total ?? 0)),
    [productSales]
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Quantity Sold",
        data: quantities,
        // color is automatic (we don’t set a specific color to keep it simple)
      },
      {
        label: "Total Sales",
        data: totals,
        yAxisID: "y1",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      title: { display: false },
      legend: { position: "top" },
      tooltip: { enabled: true },
    },
    scales: {
      x: { stacked: false },
      y: {
        type: "linear",   // <-- this is the one that needs LinearScale
        position: "left",
        ticks: { precision: 0 },
      },
      y1: {
        type: "linear",
        position: "right",
        grid: { drawOnChartArea: false },
      },
    },
  };

  return (
    <div style={{ height: 360 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
