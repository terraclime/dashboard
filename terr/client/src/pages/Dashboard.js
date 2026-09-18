import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import {
  AirdropIcon,
  WaterEnergyIcon,
  MoneySafeIcon,
} from "hugeicons-react";
import BarChartComponent from "../components/Chart";
// import LeaksAcrossBlocks from "../components/LeaksAcrossBlocks";
import {
  fetchDashboardOverview,
  fetchDashboardTariff,
  saveDashboardTariff,
} from "../api/endpoints";

const TARIFF_STORAGE_KEY = "current_tariff";
const TARIFF_SOURCES_STORAGE_KEY = "current_tariff_sources";

const formatCurrency = (value) => `\u20B9${value.toLocaleString("en-IN")}`;

const toLocalIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const buildCalendarCycleOptions = (baseDate = new Date()) =>
  [
    { id: "current", label: "Current Billing Cycle", monthsAgo: 0 },
    { id: "previous-1", label: "Last Month Billing Cycle", monthsAgo: 1 },
    { id: "previous-2", label: "Two Months Ago Billing Cycle", monthsAgo: 2 },
  ].map((cycle) => {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - cycle.monthsAgo, 1);
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() - cycle.monthsAgo + 1, 0);

    return {
      id: cycle.id,
      label: cycle.label,
      period_start: toLocalIsoDate(start),
      period_end: toLocalIsoDate(end),
    };
  });

const createTariffSource = (index, name, volume, rate) => ({
  id: `source-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  volume,
  rate,
});

const buildDefaultTariffSources = (defaultTariff) => [
  createTariffSource(
    0,
    "Municipal Supply",
    "100",
    defaultTariff ? String(defaultTariff) : ""
  ),
];

const parseStoredTariffSources = (rawValue, fallbackTariff) => {
  if (!rawValue) return buildDefaultTariffSources(fallbackTariff);

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed) || !parsed.length) {
      return buildDefaultTariffSources(fallbackTariff);
    }

    const normalized = parsed
      .map((source, index) => ({
        id: source?.id || createTariffSource(index, "", "", "").id,
        name: source?.name || `Source ${index + 1}`,
        volume:
          source?.volume === 0 || source?.volume
            ? String(source.volume)
            : "",
        rate:
          source?.rate === 0 || source?.rate
            ? String(source.rate)
            : "",
      }))
      .filter((source) => source.name || source.volume || source.rate);

    return normalized.length
      ? normalized
      : buildDefaultTariffSources(fallbackTariff);
  } catch (error) {
    return buildDefaultTariffSources(fallbackTariff);
  }
};

const normalizeTariffSources = (sources, fallbackTariff) => {
  if (!Array.isArray(sources) || !sources.length) {
    return buildDefaultTariffSources(fallbackTariff);
  }

  const normalized = sources
    .map((source, index) => ({
      id: source?.id || createTariffSource(index, "", "", "").id,
      name: source?.name || `Source ${index + 1}`,
      volume:
        source?.volume === 0 || source?.volume
          ? String(source.volume)
          : "",
      rate:
        source?.rate === 0 || source?.rate
          ? String(source.rate)
          : "",
    }))
    .filter((source) => source.name || source.volume || source.rate);

  return normalized.length
    ? normalized
    : buildDefaultTariffSources(fallbackTariff);
};

const computeBlendedRate = (sources, fallbackTariff) => {
  const totals = sources.reduce(
    (accumulator, source) => {
      const volume = Number(source.volume);
      const rate = Number(source.rate);

      if (Number.isFinite(volume) && volume > 0) {
        accumulator.totalVolume += volume;
        if (Number.isFinite(rate) && rate >= 0) {
          accumulator.totalCost += volume * rate;
        }
      }

      return accumulator;
    },
    { totalVolume: 0, totalCost: 0 }
  );

  if (totals.totalVolume > 0) {
    return Number((totals.totalCost / totals.totalVolume).toFixed(2));
  }

  return fallbackTariff;
};

function Dashboard() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("current");
  const [granularity, setGranularity] = useState("weekly");
  const [hourlyDate, setHourlyDate] = useState("");
  const [tariffSources, setTariffSources] = useState([]);
  const [isTariffEditorOpen, setIsTariffEditorOpen] = useState(false);
  const tariffEditorRef = useRef(null);
  const loadedTariffCycleRef = useRef("");

  const handleButtonOpen = () => {
    setButtonOpen(!buttonOpen);
  };

  useEffect(() => {
    handleApiCall();
  }, []);

  useEffect(() => {
    if (dashboardData?.apartment?.billing_cycle) {
      setSelectedCycle("current");
    }
  }, [dashboardData]);

  const defaultTariff = useMemo(
    () => Number(dashboardData?.apartment?.billing_cycle?.tariff_per_kl || 0),
    [dashboardData]
  );

  const formatRange = (start, end) => {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const cycleOptions = useMemo(() => {
    const cycles = dashboardData?.billing_cycles?.length
      ? dashboardData.billing_cycles
      : buildCalendarCycleOptions();

    return cycles.map((cycle) => ({
      ...cycle,
      label: `${cycle.label} (${formatRange(
        new Date(`${cycle.period_start}T00:00:00`),
        new Date(`${cycle.period_end}T00:00:00`)
      )})`,
    }));
  }, [dashboardData]);

  const selectedCycleMeta = useMemo(
    () => cycleOptions.find((option) => option.id === selectedCycle),
    [cycleOptions, selectedCycle]
  );

  const selectedCycleId = useMemo(() => {
    const periodStart =
      selectedCycleMeta?.period_start ||
      dashboardData?.apartment?.billing_cycle?.period_start;

    return periodStart ? periodStart.slice(0, 7) : "";
  }, [selectedCycleMeta, dashboardData]);

  useEffect(() => {
    if (!dashboardData?.apartment?.billing_cycle || !selectedCycleId) return;

    if (selectedCycle !== "current") {
      loadedTariffCycleRef.current = "";
      setTariffSources([
        createTariffSource(0, "Default tariff", "100", String(defaultTariff || "")),
      ]);
      return;
    }

    let isCurrent = true;

    const loadTariffSources = async () => {
      const apartmentId = localStorage.getItem("apartment_id");

      try {
        const result = await fetchDashboardTariff(apartmentId, selectedCycleId);
        if (!isCurrent) return;

        const remoteSources = normalizeTariffSources(
          result.data?.sources,
          defaultTariff
        );
        setTariffSources(remoteSources);
        loadedTariffCycleRef.current = selectedCycleId;
      } catch (error) {
        if (!isCurrent) return;

        const storedSources = localStorage.getItem(TARIFF_SOURCES_STORAGE_KEY);
        setTariffSources(parseStoredTariffSources(storedSources, defaultTariff));
        loadedTariffCycleRef.current = selectedCycleId;
      }
    };

    loadTariffSources();

    return () => {
      isCurrent = false;
    };
  }, [selectedCycle, selectedCycleId, dashboardData, defaultTariff]);

  useEffect(() => {
    if (
      selectedCycle !== "current" ||
      !selectedCycleId ||
      loadedTariffCycleRef.current !== selectedCycleId
    ) {
      return;
    }

    const blendedRate = computeBlendedRate(tariffSources, defaultTariff);

    if (tariffSources.length) {
      localStorage.setItem(
        TARIFF_SOURCES_STORAGE_KEY,
        JSON.stringify(tariffSources)
      );
    }

    if (Number.isFinite(blendedRate) && blendedRate > 0) {
      localStorage.setItem(TARIFF_STORAGE_KEY, String(blendedRate));
    } else {
      localStorage.removeItem(TARIFF_STORAGE_KEY);
    }

    const saveTimer = window.setTimeout(() => {
      const apartmentId = localStorage.getItem("apartment_id");
      saveDashboardTariff({
        apartment_id: apartmentId,
        cycle_id: selectedCycleId,
        sources: tariffSources,
        blended_rate: blendedRate,
      }).catch((error) => {
        console.error("Failed to save tariff configuration", error);
      });
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [tariffSources, selectedCycle, selectedCycleId, defaultTariff]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        tariffEditorRef.current &&
        !tariffEditorRef.current.contains(event.target)
      ) {
        setIsTariffEditorOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      setHourlyDate((previousValue) => {
        if (previousValue && cycleSeriesData.isoLabels.includes(previousValue)) {
          return previousValue;
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
    const apiHourlySeries =
      dashboardData?.hourly_series?.[selectedCycle]?.[hourlyDate];

    if (apiHourlySeries?.labels?.length) {
      return {
        labels: apiHourlySeries.labels,
        values: apiHourlySeries.values.map((value) =>
          Number((value / 1000).toFixed(2))
        ),
      };
    }

    if (!formattedDailySeries.values.length || !hourlyDate) {
      return { labels: [], values: [] };
    }

    return {
      labels: [],
      values: [],
    };
  }, [dashboardData, selectedCycle, hourlyDate, formattedDailySeries.values.length]);

  const chartSeries = useMemo(() => {
    if (granularity === "weekly") return weeklySeries;
    if (granularity === "hourly") return hourlySeries;

    return {
      labels: formattedDailySeries.labels,
      values: formattedDailySeries.values,
    };
  }, [formattedDailySeries, weeklySeries, hourlySeries, granularity]);

  const totalConsumptionKL = useMemo(() => {
    if (!formattedDailySeries.values.length) return 0;

    return Number(
      formattedDailySeries.values
        .reduce((sum, value) => sum + value, 0)
        .toFixed(2)
    );
  }, [formattedDailySeries.values]);

  const effectiveTariff = useMemo(() => {
    if (selectedCycle !== "current") {
      return defaultTariff;
    }

    return computeBlendedRate(tariffSources, defaultTariff);
  }, [selectedCycle, tariffSources, defaultTariff]);

  const totalWaterCharges = useMemo(
    () => Number((totalConsumptionKL * effectiveTariff).toFixed(2)),
    [totalConsumptionKL, effectiveTariff]
  );

  const totalMeters = Number(dashboardData?.Dashboard_Total_Devices || 0);
  const activeMeters = Number(dashboardData?.Active_devices || 0);
  const activeTariffSources = tariffSources.filter(
    (source) => source.name || source.volume || source.rate
  );

  const handleTariffSourceChange = (sourceId, field, value) => {
    setTariffSources((currentSources) =>
      currentSources.map((source) =>
        source.id === sourceId ? { ...source, [field]: value } : source
      )
    );
  };

  const handleAddTariffSource = () => {
    setTariffSources((currentSources) => [
      ...currentSources,
      createTariffSource(
        currentSources.length,
        `Source ${currentSources.length + 1}`,
        "",
        ""
      ),
    ]);
  };

  const handleRemoveTariffSource = (sourceId) => {
    setTariffSources((currentSources) => {
      if (currentSources.length === 1) {
        return currentSources;
      }

      return currentSources.filter((source) => source.id !== sourceId);
    });
  };

  const handleResetTariffSources = () => {
    const nextSources = buildDefaultTariffSources(defaultTariff);
    setTariffSources(nextSources);
    localStorage.removeItem(TARIFF_SOURCES_STORAGE_KEY);
    if (defaultTariff) {
      localStorage.setItem(TARIFF_STORAGE_KEY, String(defaultTariff));
    }
  };

  const handleApiCall = async () => {
    try {
      setLoading(true);
      setError("");
      const apartmentId = localStorage.getItem("apartment_id");
      const dashboardResult = await fetchDashboardOverview(apartmentId);
      setDashboardData(dashboardResult.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load dashboard data right now.");
    }
    setLoading(false);
  };

  const summaryCards = [
    {
      title: "Active / Total Meters",
      value: totalMeters ? `${activeMeters}/${totalMeters}` : "-",
      caption: totalMeters
        ? `${totalMeters - activeMeters} inactive meters`
        : "Meter status unavailable",
      icon: <AirdropIcon size={32} />,
    },
    {
      title: "Total Consumption",
      value: totalConsumptionKL ? totalConsumptionKL.toLocaleString("en-IN") : "-",
      suffix: "kL",
      caption: "Across the selected billing cycle",
      icon: <WaterEnergyIcon size={32} />,
    },
    {
      title: "Total Water Charges",
      value: totalWaterCharges ? formatCurrency(totalWaterCharges) : "-",
      caption: effectiveTariff
        ? `${formatCurrency(effectiveTariff)} per kL blended rate`
        : "No tariff available",
      icon: <MoneySafeIcon size={28} />,
    },
    {
      title: "Blended Water Tariff",
      value: effectiveTariff ? formatCurrency(effectiveTariff) : "-",
      suffix: "/ kL",
      caption: `${activeTariffSources.length || 1} source mix`,
      icon: <MoneySafeIcon size={28} />,
    },
  ];

  const granularityOptions = [
    { id: "weekly", label: "Weekly" },
    { id: "daily", label: "Daily" },
    { id: "hourly", label: "Hourly" },
  ];

  return (
    <div className="flex">
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
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">Welcome back</p>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {dashboardData?.apartment?.name ||
                      localStorage.getItem("apartment_name") ||
                      "Terraclime Demo Community"}
                  </h1>
                </div>
                <div className="flex flex-col md:items-end gap-4 text-sm text-gray-600">
                  <div className="w-full md:w-72">
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
                  <div className="w-full md:w-72 relative" ref={tariffEditorRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setIsTariffEditorOpen((currentValue) => !currentValue)
                      }
                      className="w-full rounded-xl border border-gray-200 bg-gradient-to-br from-white to-emerald-50 px-4 py-3 text-left shadow-sm transition hover:border-[#00A877]"
                    >
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Tariff Sources
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {effectiveTariff ? formatCurrency(effectiveTariff) : "-"}
                            <span className="ml-1 text-sm font-normal text-gray-500">
                              / kL
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Click to edit source-wise volumes and rates
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#00A877] shadow-sm">
                          {activeTariffSources.length || 1} sources
                        </span>
                      </div>
                    </button>

                    {isTariffEditorOpen && (
                      <div className="absolute right-0 z-20 mt-3 w-full md:w-[440px] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">
                              Blended tariff calculator
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                              Set expected source volumes in kL and rate per kL.
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Blended rate
                            </p>
                            <p className="text-lg font-semibold text-[#00A877]">
                              {effectiveTariff
                                ? formatCurrency(effectiveTariff)
                                : "-"}
                              <span className="ml-1 text-xs font-normal text-gray-500">
                                / kL
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {tariffSources.map((source, index) => (
                            <div
                              key={source.id}
                              className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Source {index + 1}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTariffSource(source.id)}
                                  disabled={
                                    tariffSources.length === 1 ||
                                    selectedCycle !== "current"
                                  }
                                  className="text-xs text-gray-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:text-gray-300"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input
                                  type="text"
                                  value={source.name}
                                  onChange={(event) =>
                                    handleTariffSourceChange(
                                      source.id,
                                      "name",
                                      event.target.value
                                    )
                                  }
                                  disabled={selectedCycle !== "current"}
                                  placeholder="Source name"
                                  className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50 disabled:bg-gray-100"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={source.volume}
                                  onChange={(event) =>
                                    handleTariffSourceChange(
                                      source.id,
                                      "volume",
                                      event.target.value
                                    )
                                  }
                                  disabled={selectedCycle !== "current"}
                                  placeholder="Volume (kL)"
                                  className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50 disabled:bg-gray-100"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={source.rate}
                                  onChange={(event) =>
                                    handleTariffSourceChange(
                                      source.id,
                                      "rate",
                                      event.target.value
                                    )
                                  }
                                  disabled={selectedCycle !== "current"}
                                  placeholder="Rate (\u20B9 / kL)"
                                  className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50 disabled:bg-gray-100"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="text-xs text-gray-500">
                            {selectedCycle === "current"
                              ? "The current cycle tariff syncs to the billing page."
                              : "Previous cycles use the recorded tariff only."}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleResetTariffSources}
                              disabled={selectedCycle !== "current"}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={handleAddTariffSource}
                              disabled={selectedCycle !== "current"}
                              className="rounded-lg bg-[#00A877] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#008f65] disabled:cursor-not-allowed disabled:bg-[#9dd8c4]"
                            >
                              Add source
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
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
                      <p className="text-xs text-gray-500 mt-2">{card.caption}</p>
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
              <div className="grid grid-cols-1 gap-5">
                <div className="bg-white rounded-2xl p-4 shadow-sm">
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
                        <label
                          className="text-xs text-gray-500"
                          htmlFor="hourly-date"
                        >
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
                {/* <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h2 className="font-semibold text-gray-900">
                        Leaks by block
                      </h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Distribution of leak volume across apartment blocks
                      </p>
                    </div>
                  </div>
                  <LeaksAcrossBlocks blocks={leakBreakdown} />
                </div> */}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
