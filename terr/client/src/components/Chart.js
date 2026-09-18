import React, { useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const GradientLineChart = ({props = {}}) => {
  const chartRef = useRef(null);
  const createDataset = (labels = [], values = []) => ({
    labels,
    datasets: [
      {
        label: 'Consumption (kL)',
        data: values,
        borderColor: '#00A877',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#00A877',
        backgroundColor: 'rgba(0,168,119,0.2)',
      },
    ],
  });

  const [chartData, setChartData] = useState(
    createDataset(props?.labels, props?.values)
  );

  useEffect(() => {
    setChartData(createDataset(props?.labels, props?.values));
  }, [props?.labels, props?.values]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const chartInstance = chart.chartInstance || chart;

    const ctx = chartInstance.ctx;
    const chartArea = chartInstance.chartArea;

    if (!ctx || !chartArea) return;

    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, 'rgba(0, 168, 119, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 168, 119, 0)');

    setChartData((previous) => ({
      ...previous,
      datasets: previous.datasets.map((dataset) => ({
        ...dataset,
        backgroundColor: gradient,
      })),
    }));
  }, [props?.labels, props?.values]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 14 },
          usePointStyle: true,
          pointStyle: 'roundedRect',
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        grid: { display: false },
        beginAtZero: true,
        ticks: {
          font: { size: 13 },
          callback: (value) => `${value} kL`,
        },
      },
    },
  };

  return (
    <div className="w-full h-[300px]">
      <Line ref={chartRef} data={chartData} options={options} />
    </div>
  );
};

export default GradientLineChart;
