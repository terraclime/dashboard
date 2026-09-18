import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(ArcElement, Tooltip, Legend);
const DonutChart = ({props = {}}) => {
    const active = Number(props?.Active_devices || 0);
    const inactive = Number(props?.Inactive_Devices || 0);
    const total = Number(props?.Dashboard_Total_Devices || active + inactive);
    const data = {
        labels: ['Active Devices', 'Inactive Devices'],
        datasets: [
            {
                label: 'Device Status',
                data: [active, inactive],
                backgroundColor: ['#00A877', '#B5E5D5'],
                borderColor: ['#ffffff', '#ffffff'],
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
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Total Devices', centerX, centerY - 10);
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#00A877';
        ctx.fillText(`${total}`, centerX, centerY + 12);
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
            font: { size: 14 },
            usePointStyle: true,
            pointStyle: 'roundedRect',
            },
        },
        },
        cutout: '70%',
    };
    return (
        <div className="w-full max-w-sm h-[300px] mx-auto p-4 bg-white rounded-2xl">
                <Doughnut data={data} options={options} plugins={[centerTextPlugin]} />
        </div>
    );
};
export default DonutChart;
