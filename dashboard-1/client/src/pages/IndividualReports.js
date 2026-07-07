import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import { useParams } from "react-router-dom";
import FlatConsumptionStats from "../components/FlatConsumptionStats";
import { fetchFlatReport } from "../api/endpoints";
function IndividualReports() {
  const { id } = useParams();
  const [buttonOpen, setButtonOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [granularity, setGranularity] = useState("weekly");
  const granularityOptions = [
    { id: "weekly", label: "Weekly" },
    { id: "daily", label: "Daily" },
    { id: "hourly", label: "Hourly" },
  ];
  const [hourlyDate, setHourlyDate] = useState("");
  const inletPalette = [
    "#2563EB",
    "#F97316",
    "#9333EA",
    "#F59E0B",
    "#EF4444",
    "#0EA5E9",
  ];
  const handleButtonOpen = () => {
    setButtonOpen(!buttonOpen);
  };
  useEffect(() => {
    const loadReport = async () => {
      try {
        setLoading(true);
        setError("");
        const apartmentId = localStorage.getItem("apartment_id");
        const response = await fetchFlatReport(apartmentId, id);
        setReport(response.data);
      } catch (err) {
        console.error(err);
        setError("Unable to fetch flat report right now.");
      }
      setLoading(false);
    };
    loadReport();
  }, [id]);

  useEffect(() => {
    if (report) {
      setGranularity("weekly");
    }
  }, [report]);

  const dailyChart = useMemo(() => {
    if (!report?.consumption_series) {
      return { labels: [], isoLabels: [], datasets: [] };
    }

    const isoLabels = report.consumption_series.map((entry) => entry.date);
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    const labels = isoLabels.map((date) =>
      formatter.format(new Date(`${date}T00:00:00`))
    );
    const totals = report.consumption_series.map((entry) => entry.litres);

    const deviceDatasets = (report.device_consumption || []).map(
      (device, index) => ({
        label: device.device_id,
        values: device.data.map((point) => point.litres),
        color: inletPalette[index % inletPalette.length],
      })
    );

    return {
      labels,
      isoLabels,
      datasets: [
        {
          label: "Total consumption (L)",
          values: totals,
          fill: true,
          color: "#00A877",
        },
        ...deviceDatasets,
      ],
    };
  }, [report]);

  useEffect(() => {
    if (dailyChart.isoLabels.length) {
      setHourlyDate((prev) => {
        if (prev && dailyChart.isoLabels.includes(prev)) {
          return prev;
        }
        return dailyChart.isoLabels[dailyChart.isoLabels.length - 1];
      });
    }
  }, [dailyChart]);

  const aggregateToWeekly = useMemo(() => {
    return (chart) => {
      if (!chart.labels.length) return chart;
      const chunkSize = 7;
      const totalWeeks = Math.ceil(chart.datasets[0].values.length / chunkSize);
      const weekLabels = Array.from({ length: totalWeeks }).map(
        (_, index) => `Week ${index + 1}`
      );
      return {
        labels: weekLabels,
        datasets: chart.datasets.map((dataset, index) => {
          const values = weekLabels.map((_, week) => {
            const start = week * chunkSize;
            const slice = dataset.values.slice(start, start + chunkSize);
            if (!slice.length) return 0;
            return Number(
              slice.reduce((sum, value) => sum + value, 0).toFixed(2)
            );
          });
          return {
            ...dataset,
            fill: index === 0 ? dataset.fill : false,
            values,
          };
        }),
        isoLabels: chart.isoLabels,
      };
    };
  }, []);

  const aggregateToHourly = useMemo(() => {
    return (chart) => {
      if (!chart.labels.length) return chart;
      const hourLabels = Array.from({ length: 24 }, (_, hour) =>
        `${hour.toString().padStart(2, "0")}:00`
      );
      return {
        labels: hourLabels,
        datasets: chart.datasets.map((dataset, datasetIndex) => {
          const index = chart.isoLabels?.indexOf(hourlyDate);
          const fallbackIndex = index >= 0 ? index : chart.isoLabels.length - 1;
          const targetValue = dataset.values[fallbackIndex] || 0;
          const base = targetValue / 24;
          const values = hourLabels.map((_, hour) =>
            Number(
              (
                base +
                base * 0.25 *
                  Math.sin((hour + datasetIndex) / 3)
              ).toFixed(2)
            )
          );
          return {
            ...dataset,
            fill: datasetIndex === 0 ? dataset.fill : false,
            values,
          };
        }),
        isoLabels: chart.isoLabels,
      };
    };
  }, [hourlyDate]);

  const chartConfig = useMemo(() => {
    if (granularity === "weekly") {
      return aggregateToWeekly(dailyChart);
    }
    if (granularity === "hourly") {
      return aggregateToHourly(dailyChart);
    }
    return dailyChart;
  }, [dailyChart, granularity, aggregateToWeekly, aggregateToHourly]);

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
        <div className="">
          <NavBar />
        </div>
        <div className="mt-5">
          <section className="px-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col md:flex-row md:justify-between gap-6">
              <div>
                <p className="text-sm text-gray-500">Flat</p>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {report?.flat_id || id?.toUpperCase()}
                </h2>
                <p className="text-sm text-gray-500 mt-2">
                  Block: {report?.block_id || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Resident</p>
                <p className="text-lg font-semibold text-gray-900">
                  {report?.resident_name || "-"}
                </p>
                <p className="text-sm text-gray-500">
                  {report?.resident_email || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cycle total</p>
                <p className="text-lg font-semibold text-gray-900">
                  {report?.totals?.consumption?.toLocaleString() || 0} L
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Leak volume: {report?.totals?.leak_litres || 0} L
                </p>
              </div>
            </div>
          </section>
          <section className="px-6 mt-4 pb-10">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
            )}
            {loading ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
                Loading flat report...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Consumption trend
                      </h3>
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
                          <label
                            htmlFor="flat-hourly-date"
                            className="text-xs text-gray-500"
                          >
                            Day
                          </label>
                          <input
                            id="flat-hourly-date"
                            type="date"
                            value={hourlyDate}
                            min={dailyChart.isoLabels?.[0] || ""}
                            max={
                              dailyChart.isoLabels?.[
                                dailyChart.isoLabels.length - 1
                              ] || ""
                            }
                            onChange={(event) =>
                              setHourlyDate(event.target.value)
                            }
                            className="rounded-lg border border-gray-200 bg-gray-50 py-1 px-3 text-xs focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                          />
                        </div>
                      )}
                    </div>
                    {chartConfig.labels.length ? (
                      <FlatConsumptionStats
                        labels={chartConfig.labels}
                        datasets={chartConfig.datasets}
                        unit="L"
                      />
                    ) : (
                      <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
                        No consumption data for this period.
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Recent leak events
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {report?.leak_events?.length ? (
                        report.leak_events.map((leak, index) => (
                          <div
                            key={`${leak.timestamp}-${index}`}
                            className="border border-gray-100 rounded-xl px-4 py-3 flex justify-between items-center"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {leak.source}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(leak.timestamp).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {leak.litres} L
                              </p>
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  leak.status === "resolved"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {leak.status}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">
                          No leak incidents recorded this cycle.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm mt-6">
                  <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">
                      Device health
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-3">Device ID</th>
                          <th className="px-4 py-3">Inlet</th>
                          <th className="px-4 py-3">Last seen</th>
                          <th className="px-4 py-3 text-right">
                            Leak this cycle (L)
                          </th>
                          <th className="px-4 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {report?.device_status?.map((device) => (
                          <tr key={device.device_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {device.device_id}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {device.inlet}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {device.last_seen
                                ? new Date(device.last_seen).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900">
                              {device.leak_cycle_litres}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                                  device.status === "active"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {device.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export default IndividualReports;
