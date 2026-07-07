import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import { fetchBillingSummary, sendBillByEmail, sendBulkBills } from "../api/endpoints";

const formatCurrency = (value) => `\u20B9${value.toLocaleString("en-IN")}`;

const getBillingSummaryTotals = (billing) => billing?.summary || billing || {};

const getPerFlatSummary = (billing) =>
  billing?.per_flat_summary || billing?.per_flat || [];

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getBillingCycleId = (billingCycle) => {
  const explicitCycleId = billingCycle?.cycle_id || billingCycle?.cycleId;
  if (explicitCycleId) return explicitCycleId;

  const periodStart = billingCycle?.period_start || "";
  return periodStart.length >= 7 ? periodStart.slice(0, 7) : periodStart;
};

const getBillFlatId = (entry) =>
  entry?.flat_id || entry?.flatId || entry?.bill_flat_id || entry?.billFlatId;

const getDisplayFlatNumber = (entry) =>
  entry?.flat_number || entry?.flatNumber || entry?.flat_no || entry?.flatNo || entry?.flat_id;

const getCurrentBillingCycleBounds = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  return {
    period_start: toIsoDate(start),
    period_end: toIsoDate(end),
  };
};

const escapeCsvValue = (value) => {
  const normalized = value ?? "";
  const stringValue = String(normalized);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

function Bill() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("all");
  const [tariffOverride, setTariffOverride] = useState(() =>
    localStorage.getItem("current_tariff") || ""
  );
  const [flatSendState, setFlatSendState] = useState({});
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const handleButtonOpen = () => setButtonOpen(!buttonOpen);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const apartmentId = localStorage.getItem("apartment_id");
        const response = await fetchBillingSummary(
          apartmentId,
          getCurrentBillingCycleBounds()
        );
        setBilling(response.data);
        setSelectedBlock("all");
      } catch (err) {
        console.error(err);
        setError("Unable to fetch billing summary.");
      } finally {
        setLoading(false);
      }
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

  const blockOptions = useMemo(() => {
    const perFlatSummary = getPerFlatSummary(billing);
    if (!perFlatSummary.length) return [];
    const unique = Array.from(
      new Set(perFlatSummary.map((entry) => entry.block_id).filter(Boolean))
    );
    return unique.sort();
  }, [billing]);

  const filteredFlats = useMemo(() => {
    const perFlatSummary = getPerFlatSummary(billing);
    if (!perFlatSummary.length) return [];
    if (selectedBlock === "all") return perFlatSummary;
    return perFlatSummary.filter((entry) => entry.block_id === selectedBlock);
  }, [billing, selectedBlock]);

  const effectiveTariff = useMemo(() => {
    const summary = getBillingSummaryTotals(billing);
    const defaultTariff = summary.tariff_per_kl || 0;
    const overrideNumber = Number(tariffOverride);
    const overrideValid = Number.isFinite(overrideNumber) && overrideNumber > 0;
    return overrideValid ? overrideNumber : defaultTariff;
  }, [billing, tariffOverride]);

  const displayFlats = useMemo(() => {
    return filteredFlats.map((entry) => {
      const consumption = Math.round(Number(entry.consumption_litres) || 0);
      return {
        ...entry,
        consumption_adjusted: consumption,
        projected_amount_adjusted: Math.round(
          (consumption / 1000) * effectiveTariff
        ),
      };
    });
  }, [filteredFlats, effectiveTariff]);

  const totalConsumptionForCycle = useMemo(() => {
    const summary = getBillingSummaryTotals(billing);
    if (!summary.total_consumption_litres) return 0;
    return Math.round(Number(summary.total_consumption_litres) || 0);
  }, [billing]);

  const cycleId = getBillingCycleId(billing?.billing_cycle);

  const handleSendFlatBill = async (entry) => {
    const flatId = getBillFlatId(entry);
    const email = entry.resident_email;

    if (!email) {
      setFlatSendState((prev) => ({ ...prev, [flatId]: "missing-email" }));
      return;
    }

    setFlatSendState((prev) => ({ ...prev, [flatId]: "sending" }));
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      await sendBillByEmail(email, apartmentId, cycleId || undefined);
      setFlatSendState((prev) => ({ ...prev, [flatId]: "sent" }));
    } catch (err) {
      console.error(`[sendBillByEmail] ${flatId}:`, err);
      setFlatSendState((prev) => ({ ...prev, [flatId]: "error" }));
    }
  };

  const handleSendBulkBills = async () => {
    if (!cycleId) return;
    setBulkSending(true);
    setBulkResult(null);
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      const flatIds = displayFlats.map(getBillFlatId).filter(Boolean);
      const res = await sendBulkBills(cycleId, 5, flatIds, apartmentId);
      setBulkResult({ type: "success", message: res.data.message || "Bulk send started." });
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Bulk send failed.";
      setBulkResult({ type: "error", message: msg });
    } finally {
      setBulkSending(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!displayFlats.length) return;

    const cycleLabel =
      billing?.billing_cycle?.label ||
      `${billing?.billing_cycle?.period_start || ""} to ${
        billing?.billing_cycle?.period_end || ""
      }`;

    const headers = [
      "Billing Cycle",
      "Block",
      "Flat",
      "Resident",
      "Consumption (L)",
      "Tariff (INR/kL)",
      "Projected Amount (INR)",
    ];

    const rows = displayFlats.map((entry) => [
      cycleLabel,
      entry.block_id,
      getDisplayFlatNumber(entry),
      entry.resident_name,
      entry.consumption_adjusted,
      effectiveTariff,
      entry.projected_amount_adjusted,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const blockSuffix = selectedBlock === "all" ? "all-blocks" : selectedBlock;

    link.href = downloadUrl;
    link.download = `billing-summary-current-${blockSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

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
      value: effectiveTariff ? formatCurrency(effectiveTariff) : "-",
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
                    ? `${billing.billing_cycle.period_start} to ${billing.billing_cycle.period_end}`
                    : ""}
                </p>
              </div>
              {/* <div className="flex flex-col md:items-end gap-4 text-sm text-gray-600">
                <div>
                  Next due date:{" "}
                  <span className="font-medium text-gray-900">
                    {billing?.billing_cycle?.next_due || "-"}
                  </span>
                </div>
              </div> */}
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
            <div className="px-4 py-3 border-b border-gray-100 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
              <h3 className="font-semibold text-gray-900">Per-flat summary</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={loading || !displayFlats.length}
                  className="rounded-lg border border-[#00A877] px-4 py-2 text-sm font-medium text-[#00A877] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
                >
                  Download as CSV
                </button>
                <button
                  type="button"
                  onClick={handleSendBulkBills}
                  disabled={loading || !displayFlats.length || bulkSending}
                  title="Send bills to all visible flats via email."
                  className="rounded-lg bg-[#00A877] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#008f64] disabled:cursor-not-allowed disabled:bg-[#9dd8c4]"
                >
                  {bulkSending ? "Sending..." : "Send bill"}
                </button>
              </div>
            </div>
            {bulkResult && (
              <div
                className={`px-4 py-3 text-sm border-b flex items-center justify-between ${
                  bulkResult.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <span>{bulkResult.message}</span>
                <button
                  type="button"
                  onClick={() => setBulkResult(null)}
                  className="ml-4 text-xs underline opacity-70 hover:opacity-100"
                >
                  Dismiss
                </button>
              </div>
            )}
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
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        Loading billing data...
                      </td>
                    </tr>
                  ) : displayFlats.length ? (
                    displayFlats.map((entry) => {
                      const flatId = getBillFlatId(entry);
                      const sendStatus = flatSendState[flatId];
                      return (
                        <tr key={flatId || getDisplayFlatNumber(entry)} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {getDisplayFlatNumber(entry)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {entry.resident_name}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {entry.consumption_adjusted.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {formatCurrency(entry.projected_amount_adjusted)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {sendStatus === "sent" ? (
                              <span className="text-xs font-medium text-emerald-600">Sent</span>
                            ) : sendStatus === "missing-email" ? (
                              <span className="text-xs font-medium text-amber-600">
                                No email
                              </span>
                            ) : sendStatus === "error" ? (
                              <button
                                type="button"
                                onClick={() => handleSendFlatBill(entry)}
                                className="text-xs font-medium text-red-500 underline hover:text-red-700"
                                title="Send failed - click to retry"
                              >
                                Retry
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSendFlatBill(entry)}
                                disabled={sendStatus === "sending"}
                                title={
                                  entry.resident_email
                                    ? `Send bill to ${entry.resident_email}`
                                    : "No resident email found"
                                }
                                className="rounded-md border border-[#00A877] px-3 py-1 text-xs font-medium text-[#00A877] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                              >
                                {sendStatus === "sending" ? "Sending..." : "Send"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        No billing data found for the current cycle.
                      </td>
                    </tr>
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
