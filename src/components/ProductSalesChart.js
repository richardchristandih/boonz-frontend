import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";

/** keep this tiny & local so the chart can format ticks nicely */
const formatCurrencyShort = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1_000_000_000)
    return `Rp.${(num / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(num) >= 1_000_000) return `Rp.${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `Rp.${(num / 1_000).toFixed(1)}K`;
  return `Rp.${num.toFixed(0)}`;
};

export default function ProductSalesChart({ productSales = [] }) {
  const labels = useMemo(() => productSales.map((p) => p.name), [productSales]);
  const qty = useMemo(
    () => productSales.map((p) => Number(p.quantity || 0)),
    [productSales]
  );
  const total = useMemo(
    () => productSales.map((p) => Number(p.total || 0)),
    [productSales]
  );

  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: "Quantity Sold",
          data: qty,
          yAxisID: "y",
          type: "bar",
          borderWidth: 1,
        },
        {
          label: "Total Sales",
          data: total,
          yAxisID: "y1",
          type: "bar",
          borderWidth: 1,
        },
      ],
    }),
    [labels, qty, total]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false, // let CSS control height
      layout: {
        padding: { bottom: 28 }, // reserve space for x-axis labels
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            boxWidth: 12,
            padding: 10,
          },
        },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          offset: true,
          grid: { display: true },
          ticks: {
            padding: 10, // gap from axis line → prevents clipping
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 8,
          },
        },
        y: {
          beginAtZero: true,
          grace: "5%",
          ticks: { precision: 0 },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            callback: (v) => formatCurrencyShort(v),
          },
        },
      },
      animation: { duration: 350 },
    }),
    []
  );

  return (
    <div style={{ width: "100%", height: 460 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
