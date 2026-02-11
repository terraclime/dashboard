import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import { fetchBillingSummary } from "../api/endpoints";

function Bill() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("current");
  const [selectedBlock, setSelectedBlock] = useState("all");
  const [tariffOverride, setTariffOverride] = useState(() =>
    localStorage.getItem("current_tariff") || ""
  );

  const handleButtonOpen = () => setButtonOpen(!buttonOpen);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const apartmentId = localStorage.getItem("apartment_id");
        const response = await fetchBillingSummary(apartmentId);
        setBilling(response.data);
        setSelectedCycle("current");
        setSelectedBlock("all");
      } catch (err) {
        console.error(err);
        setError("Unable to fetch billing summary.");
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "current_tariff") {
        setTariffOverride(event.newValue || "");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const formatRange = (start, end) => {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const cycleOptions = useMemo(() => {
    const cycle = billing?.billing_cycle;
    if (!cycle) return [];
    const currentStart = new Date(cycle.period_start);
    const currentEnd = new Date(cycle.period_end);
    const options = [
      {
        id: "current",
        label: `Current Cycle (${formatRange(currentStart, currentEnd)})`,
      },
    ];
    for (let i = 1; i <= 2; i += 1) {
      const prevStart = new Date(currentStart);
      prevStart.setMonth(prevStart.getMonth() - i);
      const prevEnd = new Date(currentEnd);
      prevEnd.setMonth(prevEnd.getMonth() - i);
      options.push({
        id: `previous-${i}`,
        label: `Previous Cycle ${i} (${formatRange(prevStart, prevEnd)})`,
      });
    }
    return options;
  }, [billing]);

  const blockOptions = useMemo(() => {
    if (!billing?.per_flat) return [];
    const unique = Array.from(
      new Set(billing.per_flat.map((entry) => entry.block_id))
    );
    return unique.sort();
  }, [billing]);

  const cycleFactor = useMemo(() => {
    if (selectedCycle === "current") return 1;
    if (selectedCycle === "previous-1") return 0.94;
    if (selectedCycle === "previous-2") return 0.89;
    return 1;
  }, [selectedCycle]);

  const filteredFlats = useMemo(() => {
    if (!billing?.per_flat) return [];
    if (selectedBlock === "all") return billing.per_flat;
    return billing.per_flat.filter((entry) => entry.block_id === selectedBlock);
  }, [billing, selectedBlock]);

  const effectiveTariff = useMemo(() => {
    const defaultTariff = billing?.tariff_per_kl || 0;
    if (selectedCycle !== "current") {
      return defaultTariff;
    }
    const overrideNumber = Number(tariffOverride);
    const overrideValid = Number.isFinite(overrideNumber) && overrideNumber > 0;
    return overrideValid ? overrideNumber : defaultTariff;
  }, [billing, tariffOverride, selectedCycle]);

  const displayFlats = useMemo(() => {
    return filteredFlats.map((entry) => {
      const adjustedConsumption = Math.round(
        entry.consumption_litres * cycleFactor
      );
      return {
        ...entry,
        consumption_adjusted: adjustedConsumption,
        projected_amount_adjusted: Math.round(
          (adjustedConsumption / 1000) * effectiveTariff
        ),
      };
    });
  }, [filteredFlats, effectiveTariff, cycleFactor]);

  const totalConsumptionForCycle = useMemo(() => {
    if (!billing?.total_consumption_litres) return 0;
    return Math.round(billing.total_consumption_litres * cycleFactor);
  }, [billing, cycleFactor]);

  const summaryCards = [
    {
      label: "Total consumption",
      value:
        totalConsumptionForCycle
          ? totalConsumptionForCycle.toLocaleString("en-IN")
          : "-",
      suffix: "L",
    },
    {
      label: "Tariff per kL",
      value: effectiveTariff
        ? `₹${effectiveTariff.toLocaleString("en-IN")}`
        : "-",
    },
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
        <NavBar />
        <div className="pt-5 px-6 pb-10">
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Current billing cycle</p>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {billing?.billing_cycle?.label || "-"}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {billing?.billing_cycle
                    ? `${billing.billing_cycle.period_start} → ${billing.billing_cycle.period_end}`
                    : ""}
                </p>
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
                <div>
                  Next due date:{" "}
                  <span className="font-medium text-gray-900">
                    {billing?.billing_cycle?.next_due || "-"}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className="border border-gray-100 rounded-xl p-4 bg-gradient-to-br from-white to-green-50"
                >
                  <p className="text-xs uppercase text-gray-500">
                    {card.label}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 mt-2">
                    {card.value}{" "}
                    {card.suffix ? (
                      <span className="text-sm font-normal text-gray-500">
                        {card.suffix}
                      </span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm mt-5">
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">
                Per-flat summary
              </h3>
            </div>
            <div className="px-4 py-3 flex justify-end">
              <select
                value={selectedBlock}
                onChange={(event) => setSelectedBlock(event.target.value)}
                className="w-full md:w-60 rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-600 focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
              >
                <option value="all">All blocks</option>
                {blockOptions.map((block) => (
                  <option key={block} value={block}>
                    {block}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="px-4 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">
                {error}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Flat</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3 text-right">Consumption (L)</th>
                    <th className="px-4 py-3 text-right">Projected amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        Loading billing data...
                      </td>
                    </tr>
                  ) : (
                    displayFlats.map((entry) => (
                      <tr key={entry.flat_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {entry.flat_id}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {entry.resident_name}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {entry.consumption_adjusted.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          ₹{entry.projected_amount_adjusted.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
export default Bill;
