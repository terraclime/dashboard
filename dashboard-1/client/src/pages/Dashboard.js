import React, { useState, useEffect, useMemo } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import {
  AirdropIcon,
  CpuIcon,
  WaterEnergyIcon,
  MoneySafeIcon,
} from "hugeicons-react";
import BarChartComponent from "../components/Chart";
import DonutChart from "../components/DonutChart";
import { fetchDashboardOverview } from "../api/endpoints";

function Dashboard() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("current");
  const [tariffValue, setTariffValue] = useState("");
  const [granularity, setGranularity] = useState("weekly");
  const [hourlyDate, setHourlyDate] = useState("");

  const handleButtonOpen = () => {
    setButtonOpen(!buttonOpen);
  };

  useEffect(() => {
    handleApiCall();
  }, []);

  useEffect(() => {
    const storedTariff = localStorage.getItem("current_tariff");
    if (storedTariff) {
      setTariffValue(storedTariff);
    }
  }, []);

  useEffect(() => {
    if (dashboardData?.apartment?.billing_cycle) {
      setSelectedCycle("current");
    }
  }, [dashboardData]);

  useEffect(() => {
    if (!dashboardData?.apartment?.billing_cycle) return;
    const defaultTariff = String(
      dashboardData.apartment.billing_cycle.tariff_per_kl || ""
    );
    if (selectedCycle === "current") {
      const stored = localStorage.getItem("current_tariff");
      setTariffValue(stored || defaultTariff);
    } else {
      setTariffValue(defaultTariff);
    }
  }, [selectedCycle, dashboardData]);

  const formatRange = (start, end) => {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const cycleOptions = useMemo(() => {
    const cycle = dashboardData?.apartment?.billing_cycle;
    if (!cycle) return [];

    const currentStart = new Date(cycle.period_start);
    const currentEnd = new Date(cycle.period_end);

    const buildLabel = (prefix, start, end) =>
      `${prefix} (${formatRange(start, end)})`;

    const options = [
      {
        id: "current",
        label: buildLabel("Current Cycle", currentStart, currentEnd),
      },
    ];

    for (let i = 1; i <= 2; i += 1) {
      const prevStart = new Date(currentStart);
      prevStart.setMonth(prevStart.getMonth() - i);
      const prevEnd = new Date(currentEnd);
      prevEnd.setMonth(prevEnd.getMonth() - i);
      options.push({
        id: `previous-${i}`,
        label: buildLabel(`Previous Cycle ${i}`, prevStart, prevEnd),
      });
    }

    return options;
  }, [dashboardData]);

  const cycleSeriesData = useMemo(() => {
    if (!dashboardData?.cycle_series) {
      return { isoLabels: [], values: [] };
    }
    return (
      dashboardData.cycle_series[selectedCycle] || {
        isoLabels: [],
        values: [],
      }
    );
  }, [dashboardData, selectedCycle]);

  useEffect(() => {
    if (cycleSeriesData.isoLabels?.length) {
      setHourlyDate((prev) => {
        if (prev && cycleSeriesData.isoLabels.includes(prev)) {
          return prev;
        }
        return cycleSeriesData.isoLabels[cycleSeriesData.isoLabels.length - 1];
      });
    }
  }, [cycleSeriesData]);

  const formattedDailySeries = useMemo(() => {
    if (!cycleSeriesData.isoLabels.length) {
      return { labels: [], values: [], isoLabels: [] };
    }
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    const labels = cycleSeriesData.isoLabels.map((date) =>
      formatter.format(new Date(`${date}T00:00:00`))
    );
    const values = cycleSeriesData.values.map((value) =>
      Number((value / 1000).toFixed(2))
    );
    return { labels, values, isoLabels: cycleSeriesData.isoLabels };
  }, [cycleSeriesData]);

  const weeklySeries = useMemo(() => {
    if (!formattedDailySeries.values.length) return { labels: [], values: [] };
    const weeks = [];
    const values = [];
    const chunkSize = 7;
    const totalWeeks = Math.ceil(formattedDailySeries.values.length / chunkSize);
    for (let week = 0; week < totalWeeks; week += 1) {
      const startIndex = week * chunkSize;
      const slice = formattedDailySeries.values.slice(
        startIndex,
        startIndex + chunkSize
      );
      if (!slice.length) continue;
      weeks.push(`Week ${week + 1}`);
      values.push(
        Number(slice.reduce((sum, value) => sum + value, 0).toFixed(2))
      );
    }
    return { labels: weeks, values };
  }, [formattedDailySeries.values]);

  const hourlySeries = useMemo(() => {
    if (!formattedDailySeries.values.length || !hourlyDate) {
      return { labels: [], values: [] };
    }
    const index = formattedDailySeries.isoLabels.indexOf(hourlyDate);
    const litreValue = index >= 0 ? cycleSeriesData.values[index] : 0;
    const baseKL = litreValue ? litreValue / 1000 : 0;
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const values = hours.map((hour) =>
      Number((baseKL / 24 + (baseKL / 24) * 0.35 * Math.sin(hour / 3)).toFixed(2))
    );
    return {
      labels: hours.map((hour) => `${hour.toString().padStart(2, "0")}:00`),
      values,
    };
  }, [formattedDailySeries, hourlyDate, cycleSeriesData.values]);

  const chartSeries = useMemo(() => {
    if (granularity === "weekly") return weeklySeries;
    if (granularity === "hourly") return hourlySeries;
    return {
      labels: formattedDailySeries.labels,
      values: formattedDailySeries.values,
    };
  }, [formattedDailySeries, weeklySeries, hourlySeries, granularity]);

  const totalConsumptionKL = formattedDailySeries.values.length
    ? formattedDailySeries.values
        .reduce((sum, value) => sum + value, 0)
        .toFixed(2)
    : "-";

  const handleTariffInputChange = (value) => {
    setTariffValue(value);
    if (selectedCycle === "current") {
      if (value) {
        localStorage.setItem("current_tariff", value);
      } else {
        localStorage.removeItem("current_tariff");
      }
    }
  };

  const handleApiCall = async () => {
    try {
      setLoading(true);
      setError("");
      const apartmentId = localStorage.getItem("apartment_id");
      const result = await fetchDashboardOverview(apartmentId);
      setDashboardData(result.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load dashboard data right now.");
    }
    setLoading(false);
  };

  const summaryCards = [
    {
      title: "Total Devices",
      value: dashboardData?.Dashboard_Total_Devices ?? "-",
      icon: <CpuIcon size={32} />,
    },
    {
      title: "Active Devices",
      value: dashboardData?.Active_devices ?? "-",
      icon: <AirdropIcon size={32} />,
    },
    {
      title: "Total Consumption (kL)",
      value: totalConsumptionKL,
      suffix: "kL",
      icon: <WaterEnergyIcon size={32} />,
    },
    {
      title: "Water Tariff (₹ / kL)",
      value:
        tariffValue && Number.isFinite(Number(tariffValue))
          ? `₹${Number(tariffValue).toLocaleString("en-IN")}`
          : "-",
      icon: <MoneySafeIcon size={28} />,
    },
  ];

  const granularityOptions = [
    { id: "weekly", label: "Weekly" },
    { id: "daily", label: "Daily" },
    { id: "hourly", label: "Hourly" },
  ];

  return (
    <div className={`flex`}>
      <div>
        <SideBar handleButtonOpen={handleButtonOpen} buttonOpen={buttonOpen} />
      </div>
      <div
        className={`${
          buttonOpen ? "ml-[200px] flex-grow" : "ml-[72px] flex-grow"
        } transition-all`}
      >
        <div>
          <NavBar />
        </div>
        <div className="pt-5">
          <section className="px-5">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">Welcome back</p>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {dashboardData?.apartment?.name ||
                      localStorage.getItem("apartment_name") ||
                      "Terraclime Demo Community"}
                  </h1>
                </div>
                <div className="flex flex-col md:items-end gap-4 text-sm text-gray-600">
                  <div className="w-full md:w-60">
                    <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Billing cycle
                    </label>
                    <select
                      value={selectedCycle}
                      onChange={(event) => setSelectedCycle(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                    >
                      {cycleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-60">
                    <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Tariff (₹ / kL)
                    </label>
                    <input
                      type="number"
                      value={tariffValue}
                      onChange={(event) =>
                        handleTariffInputChange(event.target.value)
                      }
                      disabled={selectedCycle !== "current"}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                {summaryCards.map((card) => (
                  <div
                    key={card.title}
                    className="border border-gray-100 rounded-xl p-4 flex items-center gap-4 bg-gradient-to-br from-white to-green-50"
                  >
                    <div className="text-[#00A877] bg-white rounded-full p-3 shadow-sm">
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        {card.title}
                      </p>
                      <p className="text-3xl font-semibold text-gray-900 mt-1">
                        {card.value}
                        {card.suffix ? (
                          <span className="text-sm font-normal text-gray-500 ml-1">
                            {card.suffix}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="mt-5 px-5 pb-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
            )}
            {loading ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
                Loading dashboard...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="col-span-2 bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                    <h2 className="font-semibold text-gray-900">
                      Consumption trend
                    </h2>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1 w-fit">
                      {granularityOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setGranularity(option.id)}
                          className={`px-3 py-1 text-xs rounded-full transition-colors ${
                            granularity === option.id
                              ? "bg-white shadow text-[#00A877]"
                              : "text-gray-500"
                          }`}
                        >
                          {option.label}
                        </button>
                        ))}
                    </div>
                    {granularity === "hourly" && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500" htmlFor="hourly-date">
                          Day
                        </label>
                        <input
                          id="hourly-date"
                          type="date"
                          value={hourlyDate}
                          min={formattedDailySeries.isoLabels[0] || ""}
                          max={
                            formattedDailySeries.isoLabels[
                              formattedDailySeries.isoLabels.length - 1
                            ] || ""
                          }
                          onChange={(event) => setHourlyDate(event.target.value)}
                          className="rounded-lg border border-gray-200 bg-gray-50 py-1 px-3 text-xs focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                        />
                      </div>
                    )}
                  </div>
                  {dashboardData && (
                    <BarChartComponent
                      key={`${selectedCycle}-${granularity}`}
                      props={chartSeries}
                    />
                  )}
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="font-semibold text-gray-900">
                      Device health
                    </h2>
                  </div>
                  {dashboardData && <DonutChart props={dashboardData} />}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
