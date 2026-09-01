import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import TenantAssignmentModal from "../components/TenantAssignmentModal";
import {
  assignFlatOccupancy,
  fetchBillingSummary,
  finalizeTenantBilling,
  previewTenantFinalization,
  retryFinalBillEmail,
  sendBillByEmail,
  sendBulkBills,
} from "../api/endpoints";

const formatCurrency = (value) => `\u20B9${value.toLocaleString("en-IN")}`;

const getBillingSummaryTotals = (billing) => billing?.summary || billing || {};

const getPerFlatSummary = (billing) =>
  billing?.per_flat_summary || billing?.per_flat || [];

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const toLocalIsoDate = (date = new Date()) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

const addIsoDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

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
  const [finalizationEntry, setFinalizationEntry] = useState(null);
  const [cutoffDate, setCutoffDate] = useState("");
  const [finalizationPreview, setFinalizationPreview] = useState(null);
  const [finalizationLoading, setFinalizationLoading] = useState(false);
  const [finalizationSubmitting, setFinalizationSubmitting] = useState(false);
  const [finalizationError, setFinalizationError] = useState("");
  const [finalizationState, setFinalizationState] = useState({});
  const [assignmentEntry, setAssignmentEntry] = useState(null);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const cycleId = getBillingCycleId(billing?.billing_cycle);

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
    if (!finalizationEntry || !cutoffDate || !cycleId) return undefined;
    let cancelled = false;
    const loadPreview = async () => {
      setFinalizationLoading(true);
      setFinalizationError("");
      setFinalizationPreview(null);
      try {
        const apartmentId = localStorage.getItem("apartment_id");
        const response = await previewTenantFinalization(
          getBillFlatId(finalizationEntry),
          apartmentId,
          cycleId,
          cutoffDate
        );
        if (!cancelled) setFinalizationPreview(response.data.preview);
      } catch (err) {
        if (!cancelled) {
          setFinalizationError(
            err?.response?.data?.message || err.message || "Unable to calculate the final bill."
          );
        }
      } finally {
        if (!cancelled) setFinalizationLoading(false);
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [finalizationEntry, cutoffDate, cycleId]);

  const updateFinalizationState = (flatId, finalization) => {
    setFinalizationState((prev) => ({ ...prev, [flatId]: finalization }));
    setBilling((prev) => {
      if (!prev) return prev;
      const updateRows = (rows = []) => rows.map((entry) =>
        getBillFlatId(entry) === flatId
          ? {
              ...entry,
              consumption_litres: finalization.consumption_litres,
              projected_amount: finalization.water_charge,
              billing_status: "finalized",
              billing_period_start: finalization.periodStart,
              billing_period_end: finalization.periodEnd,
              finalization_id: finalization.finalization_id,
              finalization_email_status: finalization.email_status,
            }
          : entry
      );
      const updatedPerFlat = updateRows(prev.per_flat);
      const updatedPerFlatSummary = updateRows(prev.per_flat_summary);
      const totalConsumption = updatedPerFlatSummary.reduce(
        (sum, entry) => sum + Number(entry.consumption_litres || 0),
        0
      );
      const projectedAmount = updatedPerFlatSummary.reduce(
        (sum, entry) => sum + Number(entry.projected_amount || 0),
        0
      );
      return {
        ...prev,
        total_consumption_litres: totalConsumption,
        per_flat: updatedPerFlat,
        per_flat_summary: updatedPerFlatSummary,
        summary: {
          ...(prev.summary || {}),
          total_consumption_litres: totalConsumption,
          projected_amount: projectedAmount,
        },
      };
    });
  };

  const markFlatVacant = (flatId, finalization) => {
    setBilling((previous) => {
      if (!previous) return previous;
      const updateRows = (rows = []) => rows.map((entry) =>
        getBillFlatId(entry) === flatId
          ? {
              ...entry,
              resident_name: "",
              resident_email: "",
              resident_status: "vacant",
              occupancy_id: null,
              occupancy_start_date: null,
              vacated_at: finalization.periodEnd,
            }
          : entry
      );
      return {
        ...previous,
        per_flat: updateRows(previous.per_flat),
        per_flat_summary: updateRows(previous.per_flat_summary),
      };
    });
  };

  const openAssignment = (entry, vacatedAt = entry?.vacated_at) => {
    setAssignmentEntry({ ...entry, vacated_at: vacatedAt });
    setAssignmentError("");
  };

  const openFinalization = (entry) => {
    const today = toLocalIsoDate();
    const cycleStart = billing?.billing_cycle?.period_start || today;
    const cycleEnd = billing?.billing_cycle?.period_end || today;
    setFinalizationEntry(entry);
    setCutoffDate([today, cycleEnd].sort()[0] < cycleStart ? cycleStart : [today, cycleEnd].sort()[0]);
    setFinalizationPreview(null);
    setFinalizationError("");
  };

  const closeFinalization = (force = false) => {
    if (finalizationSubmitting && !force) return;
    setFinalizationEntry(null);
    setFinalizationPreview(null);
    setFinalizationError("");
  };

  const handleFinalizeTenant = async () => {
    if (!finalizationEntry || !finalizationPreview) return;
    const flatId = getBillFlatId(finalizationEntry);
    setFinalizationSubmitting(true);
    setFinalizationError("");
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      const response = await finalizeTenantBilling(flatId, apartmentId, cycleId, cutoffDate);
      updateFinalizationState(flatId, response.data.finalization);
      markFlatVacant(flatId, response.data.finalization);
      closeFinalization(true);
      openAssignment(finalizationEntry, response.data.finalization.periodEnd);
    } catch (err) {
      const finalization = err?.response?.data?.finalization;
      if (finalization) {
        updateFinalizationState(flatId, finalization);
        markFlatVacant(flatId, finalization);
        closeFinalization(true);
        openAssignment(finalizationEntry, finalization.periodEnd);
        setBulkResult({
          type: "error",
          message: err?.response?.data?.message || "Tenant finalized, but the final email failed. You can retry it from this row.",
        });
        return;
      }
      setFinalizationError(
        err?.response?.data?.message || err.message || "Unable to finalize tenant billing."
      );
    } finally {
      setFinalizationSubmitting(false);
    }
  };

  const handleAssignTenant = async (form) => {
    if (!assignmentEntry) return;
    const flatId = getBillFlatId(assignmentEntry);
    setAssignmentSubmitting(true);
    setAssignmentError("");
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      const response = await assignFlatOccupancy(flatId, {
        apartment_id: apartmentId,
        ...form,
      });
      const occupancy = response.data.occupancy;
      setBilling((previous) => {
        if (!previous) return previous;
        const updateRows = (rows = []) => rows.map((entry) =>
          getBillFlatId(entry) === flatId
            ? {
                ...entry,
                resident_name: occupancy.resident_name,
                resident_email: occupancy.resident_email,
                resident_contact: occupancy.resident_contact,
                resident_status: occupancy.resident_status,
                occupancy_id: occupancy.occupancy_id,
                occupancy_start_date: occupancy.occupancy_start_date,
                vacated_at: null,
                consumption_litres: 0,
                projected_amount: 0,
                billing_status: "open",
                finalization_id: null,
                finalization_email_status: null,
              }
            : entry
        );
        return {
          ...previous,
          per_flat: updateRows(previous.per_flat),
          per_flat_summary: updateRows(previous.per_flat_summary),
        };
      });
      setFinalizationState((previous) => {
        const next = { ...previous };
        delete next[flatId];
        return next;
      });
      setAssignmentEntry(null);
    } catch (err) {
      setAssignmentError(
        err?.response?.data?.message || err.message || "Unable to assign the tenant."
      );
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleRetryFinalEmail = async (entry) => {
    const flatId = getBillFlatId(entry);
    const state = finalizationState[flatId];
    const finalizationId = state?.finalization_id || entry.finalization_id;
    if (!finalizationId) return;
    setFinalizationState((prev) => ({
      ...prev,
      [flatId]: { ...state, email_status: "sending" },
    }));
    try {
      const response = await retryFinalBillEmail(finalizationId);
      updateFinalizationState(flatId, response.data.finalization);
    } catch (err) {
      const finalization = err?.response?.data?.finalization;
      if (finalization) {
        updateFinalizationState(flatId, finalization);
      } else {
        setFinalizationState((prev) => ({
          ...prev,
          [flatId]: { ...state, finalization_id: finalizationId, email_status: "failed" },
        }));
      }
    }
  };

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
      const flatIds = displayFlats
        .filter((entry) => entry.resident_status !== "vacant")
        .map(getBillFlatId)
        .filter(Boolean);
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
                      const finalization = finalizationState[flatId];
                      const isFinalized = entry.billing_status === "finalized" || Boolean(finalization);
                      const isVacant = entry.resident_status === "vacant";
                      const finalEmailStatus = finalization?.email_status || entry.finalization_email_status;
                      return (
                        <tr key={flatId || getDisplayFlatNumber(entry)} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {getDisplayFlatNumber(entry)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {isVacant ? (
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Vacant</span>
                            ) : entry.resident_name}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {entry.consumption_adjusted.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {formatCurrency(entry.projected_amount_adjusted)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isVacant ? (
                              <div className="flex flex-col items-center gap-2">
                                {isFinalized && (
                                  <span className="text-xs font-medium text-emerald-700">
                                    Previous tenant finalized through {finalization?.periodEnd || entry.billing_period_end}
                                  </span>
                                )}
                                {finalEmailStatus === "failed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryFinalEmail(entry)}
                                    className="text-xs font-medium text-red-600 underline hover:text-red-700"
                                  >
                                    Retry final email
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openAssignment(entry)}
                                  className="rounded-md bg-[#00A877] px-3 py-1 text-xs font-medium text-white transition hover:bg-[#008f64]"
                                >
                                  Assign tenant
                                </button>
                              </div>
                            ) : isFinalized ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs font-medium text-emerald-700">
                                  Finalized through {finalization?.periodEnd || entry.billing_period_end}
                                </span>
                                {finalEmailStatus === "failed" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryFinalEmail(entry)}
                                    className="text-xs font-medium text-red-600 underline hover:text-red-700"
                                  >
                                    Retry final email
                                  </button>
                                ) : finalEmailStatus === "sending" ? (
                                  <span className="text-xs text-gray-500">Sending email...</span>
                                ) : (
                                  <span className="text-xs text-gray-500">Final email sent</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-wrap justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSendFlatBill(entry)}
                                  disabled={sendStatus === "sending" || !entry.resident_email}
                                  title={entry.resident_email ? `Send bill to ${entry.resident_email}` : "No resident email found"}
                                  className={`rounded-md border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 ${
                                    sendStatus === "error"
                                      ? "border-red-400 text-red-600 hover:bg-red-50"
                                      : "border-[#00A877] text-[#00A877] hover:bg-emerald-50"
                                  }`}
                                >
                                  {sendStatus === "sending" ? "Sending..." : sendStatus === "sent" ? "Sent" : sendStatus === "error" ? "Retry" : "Send"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openFinalization(entry)}
                                  disabled={!entry.resident_email}
                                  className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                                  title="Close this resident's billing period and send a final bill"
                                >
                                  Finalize tenant
                                </button>
                              </div>
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
          {finalizationEntry && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="finalize-tenant-title"
            >
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="finalize-tenant-title" className="text-xl font-semibold text-gray-900">
                      Finalize tenant billing
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      This permanently closes billing for {finalizationEntry.resident_name} in flat {getDisplayFlatNumber(finalizationEntry)}.
                    </p>
                  </div>
                  <button type="button" onClick={() => closeFinalization()} className="text-xl text-gray-400 hover:text-gray-700" aria-label="Close">
                    ×
                  </button>
                </div>

                <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="tenant-cutoff-date">
                  Move-out date
                </label>
                <input
                  id="tenant-cutoff-date"
                  type="date"
                  value={cutoffDate}
                  min={finalizationPreview?.periodStart || billing?.billing_cycle?.period_start}
                  max={[toLocalIsoDate(), billing?.billing_cycle?.period_end || toLocalIsoDate()].sort()[0]}
                  onChange={(event) => setCutoffDate(event.target.value)}
                  disabled={finalizationSubmitting}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                />

                {finalizationLoading ? (
                  <div className="mt-5 rounded-lg bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
                    Calculating final consumption...
                  </div>
                ) : finalizationPreview ? (
                  <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <dt className="text-gray-500">Email</dt><dd className="text-right font-medium text-gray-900 break-all">{finalizationPreview.residentEmail}</dd>
                      <dt className="text-gray-500">Billing period</dt><dd className="text-right font-medium text-gray-900">{finalizationPreview.periodStart} to {finalizationPreview.periodEnd}</dd>
                      <dt className="text-gray-500">Water consumed</dt><dd className="text-right font-medium text-gray-900">{Number(finalizationPreview.consumption_litres || 0).toLocaleString("en-IN")} L</dd>
                      <dt className="text-gray-500">Leakage</dt><dd className="text-right font-medium text-gray-900">{Number(finalizationPreview.leakage_litres || 0).toLocaleString("en-IN")} L</dd>
                      <dt className="font-medium text-gray-700">Final amount</dt><dd className="text-right text-lg font-semibold text-gray-900">{formatCurrency(Number(finalizationPreview.total_amount || 0))}</dd>
                    </dl>
                  </div>
                ) : null}

                {finalizationError && (
                  <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{finalizationError}</div>
                )}

                <p className="mt-4 text-xs text-gray-500">
                  Usage after this date will not be charged to this resident. A future resident will start from the following day.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={() => closeFinalization()} disabled={finalizationSubmitting} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="button" onClick={handleFinalizeTenant} disabled={!finalizationPreview || finalizationLoading || finalizationSubmitting} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-200">
                    {finalizationSubmitting ? "Finalizing..." : "Finalize and send email"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <TenantAssignmentModal
            flatId={assignmentEntry ? getBillFlatId(assignmentEntry) : ""}
            earliestStart={assignmentEntry?.vacated_at ? addIsoDays(assignmentEntry.vacated_at, 1) : ""}
            submitting={assignmentSubmitting}
            error={assignmentError}
            onClose={() => {
              if (!assignmentSubmitting) setAssignmentEntry(null);
            }}
            onSubmit={handleAssignTenant}
          />
        </div>
      </div>
    </div>
  );
}

export default Bill;
