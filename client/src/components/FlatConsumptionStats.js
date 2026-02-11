import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

const palette = [
  "#00A877",
  "#2563EB",
  "#F97316",
  "#9333EA",
  "#F59E0B",
  "#0EA5E9",
  "#EF4444",
];

const FlatConsumptionStats = ({ labels = [], datasets = [], unit = "L" }) => {
  const chartData = useMemo(() => {
    if (!labels.length) {
      return { labels: [], datasets: [] };
    }

    return {
      labels,
      datasets: datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.values,
        fill: dataset.fill ?? false,
        borderColor: dataset.color || palette[index % palette.length],
        backgroundColor:
          dataset.backgroundColor ||
          `${(dataset.color || palette[index % palette.length])}26`,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor:
          dataset.color || palette[index % palette.length],
      })),
    };
  }, [labels, datasets]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          pointStyle: "roundedRect",
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: { size: 10 },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          callback: (value) => `${value} ${unit}`,
        },
      },
    },
  };

  return (
    <div className="h-[280px]">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default FlatConsumptionStats;
