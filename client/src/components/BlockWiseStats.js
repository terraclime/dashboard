import React from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);
const BlockDonutChart = ({ props = {} }) => {
  const entries = Object.entries(props?.blockConsumption || {});
  const labels = entries.map(([block]) => block);
  const values = entries.map(([, value]) => value);
  const safeValues = values.length ? values : [0];
  const safeLabels = labels.length ? labels : ["-"];
  const data = {
    labels: safeLabels,
    datasets: [
      {
        label: "Consumption in L",
        data: safeValues,
        backgroundColor: [
          "#00A877",
          "#B5E5D5",
          "#006B4A",
          "#009167",
          "#33B88F",
        ],
        borderColor: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        borderWidth: 2,
      },
    ],
  };
  // const centerTextPlugin = {
  //     id: 'centerText',
  //     beforeDraw: (chart) => {
  //     const { width } = chart;
  //     const { top, bottom, left, right } = chart.chartArea;
  //     const ctx = chart.ctx;
  //     ctx.save();
  //     const centerX = (left + right) / 2;
  //     const centerY = (top + bottom) / 2;
  //     ctx.font = 'bold 15px sans-serif';
  //     ctx.fillStyle = '#333';
  //     ctx.textAlign = 'center';
  //     ctx.textBaseline = 'middle';
  //     ctx.fillText('Total Consumption', centerX, centerY - 10);
  //     ctx.font = 'bold 20px sans-serif';
  //     ctx.fillStyle = '#00A877';
  //     ctx.fillText(`${values}`, centerX, centerY + 12);
  //     ctx.restore();
  //     },
  // };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        grid: {
          display: false,
        },
      },
    },
    cutout: "70%",
  };
  return (
    <div className="w-full h-[300px] p-6 bg-white rounded-2xl">
      <Bar data={data} options={options} key={safeValues.join("-")} />
    </div>
  );
};

const InactiveDevice = ({ props = {} }) => {
  const values = props?.donutChartData?.map((item) => item.inactiveDevices) || [];
  const donutLabels = props?.donutChartData?.map((item) => item.block) || [];
  const safeValues = values.length ? values : [0];
  const total = safeValues.reduce((sum, value) => sum + value, 0);
  const data = {
    labels: donutLabels.length ? donutLabels : ["-"],
    datasets: [
      {
        label: "Inactive Devices",
        data: safeValues,
        backgroundColor: [
          "#00A877",
          "#B5E5D5",
          "#006B4A",
          "#009167",
          "#33B88F",
        ],
        borderColor: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        borderWidth: 2,
      },
    ],
  };
  const centerTextPlugin = {
    id: "centerText",
    beforeDraw: (chart) => {
      if (!chart.chartArea) return;
      const { top, bottom, left, right } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      ctx.font = "bold 15px sans-serif";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Inactive", centerX, centerY - 10);
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "#00A877";
      ctx.fillText(`${total}`, centerX, centerY + 12);
      ctx.restore();
    },
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          font: {
            size: 14,
          },
          usePointStyle: true,
          pointStyle: "roundedRect",
        },
      },
    },
    // scales: {
    //     x: {
    //       grid: {
    //         display: false
    //       }
    //     },
    //     y: {
    //       grid: {
    //         display: false
    //       }
    //     }
    // },
    cutout: "70%",
  };
  return (
    <div className="w-full h-[300px] p-6 bg-white rounded-2xl">
      <Doughnut
        data={data}
        options={options}
        plugins={[centerTextPlugin]}
        key={`inactive-${safeValues.join("-")}`}
      />
    </div>
  );
};
export { BlockDonutChart, InactiveDevice };
