import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(ArcElement, Tooltip, Legend);
const LeaksAcrossBlocks = ({ blocks = [] }) => {
    const labels = blocks.map((block) => block.block_id);
    const values = blocks.map((block) => block.litres);
    const total = values.reduce((sum, value) => sum + value, 0);
    const safeLabels = labels.length ? labels : ["-"];
    const safeValues = values.length ? values : [0];
    const centerValue = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
    const data = {
        labels: safeLabels,
        datasets: [
            {
                label: 'Leak volume (L)',
                data: safeValues,
                backgroundColor: ['#00A877', '#B5E5D5', '#006B4A', '#009167','#33B88F'],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
                borderWidth: 2,
            },
        ],
    };
    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: (chart) => {
        if (!chart.chartArea) return;
        const { top, bottom, left, right } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const titleFont = centerValue.length > 6 ? 14 : 16;
        const valueFont = centerValue.length > 6 ? 16 : 18;
        ctx.font = `bold ${titleFont}px sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Total Leak', centerX, centerY - 18);
        ctx.fillText('Volume', centerX, centerY - 4);
        ctx.font = `bold ${valueFont}px sans-serif`;
        ctx.fillStyle = '#00A877';
        ctx.fillText(centerValue, centerX, centerY + 14);
        ctx.restore();
        },
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
        legend: {
            position: 'bottom',
            labels: {
                usePointStyle: true,
                pointStyle: 'roundedRect',
            font: { size: 14 },
            },
        },
        },
        cutout: '70%',
    };
    return (
        <div className="w-full max-w-sm h-[300px] mx-auto p-4 bg-white rounded-2xl">
                <Doughnut
                  data={data}
                  options={options}
                  plugins={[centerTextPlugin]}
                  key={safeValues.join("-")}
                />
        </div>
    );
};
export default LeaksAcrossBlocks;
