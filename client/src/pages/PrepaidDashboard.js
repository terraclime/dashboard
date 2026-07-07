import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import BarChartComponent from "../components/Chart";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchPrepaidOverview,
  prepaidRechargeHouse,
  prepaidSetValve,
} from "../api/endpoints";

const fmt = (v) => `\u20B9${Number(v).toLocaleString("en-IN")}`;

// ─── Small reusable components ───────────────────────────────────────────────

function ValveChip({ status, toggling, onClick }) {
  const isOpen = status === "open";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggling}
      title={toggling ? "Updating…" : `Click to ${isOpen ? "shut off" : "open"} valve`}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition
        ${isOpen
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-red-100 text-red-600 hover:bg-red-200"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isOpen ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      {toggling ? "…" : isOpen ? "Open" : "Shutoff"}
    </button>
  );
}

function SummaryCard({ title, value, caption, colorClass }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-gradient-to-br from-white to-green-50">
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className={`text-2xl font-semibold mt-1 ${colorClass || "text-gray-900"}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{caption}</p>
    </div>
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ house, zoneId, onClose }) {
  const svgRef = useRef(null);

  // Editable base URL — lets admin switch localhost → network IP without a rebuild
  const [baseUrl, setBaseUrl] = useState("https://dashboard.terraclime.com");
  const payUrl = `${baseUrl.replace(/\/$/, "")}/pay/${house.house_id}?zone=${zoneId}`;

  const handleDownload = () => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${house.house_id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Payment QR
            </p>
            <p className="font-semibold text-gray-900">{house.house_id}</p>
            <p className="text-xs text-gray-500">{house.resident_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Editable base URL — change localhost → network IP for mobile scanning */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 px-3 text-xs font-mono focus:border-[#00A877] focus:outline-none focus:ring-1 focus:ring-[#8AE5C1]/50"
          />
        </div>

        {/* QR code */}
        <div
          ref={svgRef}
          className="flex items-center justify-center bg-white border border-gray-100 rounded-xl p-4"
        >
          <QRCodeSVG
            value={payUrl}
            size={200}
            level="M"
            includeMargin
            fgColor="#1a1a1a"
          />
        </div>

        {/* Balance info */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm flex justify-between">
          <span className="text-gray-500">Current balance</span>
          <span
            className={`font-semibold ${
              house.credit_balance_inr < 50 ? "text-red-500" : "text-gray-900"
            }`}
          >
            {fmt(house.credit_balance_inr)}
          </span>
        </div>

        {/* Payment URL */}
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-xs text-gray-400 mb-1">Payment link</p>
          <p className="text-xs text-gray-600 break-all font-mono">{payUrl}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 rounded-xl border border-[#00A877] py-2 text-sm font-medium text-[#00A877] hover:bg-emerald-50 transition"
          >
            Download SVG
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(payUrl)}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PrepaidDashboard ────────────────────────────────────────────────────────

function PrepaidDashboard() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [zoneData, setZoneData] = useState(null);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // { [house_id]: { open: bool, amount: string, submitting: bool, error: string } }
  const [rechargeState, setRechargeState] = useState({});

  // { [house_id]: true } while a valve toggle request is in flight
  const [valveToggling, setValveToggling] = useState({});

  // house object currently shown in QR modal, or null
  const [qrHouse, setQrHouse] = useState(null);

  const zoneId = localStorage.getItem("apartment_id");

  // ─── Data loading ──────────────────────────────────────────────────────────

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetchPrepaidOverview(zoneId);
      setZoneData(res.data.zone);
      setHouses(res.data.houses);
    } catch (err) {
      console.error(err);
      setError("Unable to load zone data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Valve toggle ──────────────────────────────────────────────────────────

  const handleValveToggle = async (houseId, currentStatus) => {
    const action = currentStatus === "open" ? "shutoff" : "open";
    setValveToggling((prev) => ({ ...prev, [houseId]: true }));
    try {
      const res = await prepaidSetValve(zoneId, houseId, action);
      setHouses((prev) =>
        prev.map((h) => (h.house_id === houseId ? res.data.house : h))
      );
      // Refresh zone-level aggregates (open/shutoff counts)
      setZoneData((prev) => {
        if (!prev) return prev;
        const delta = action === "open" ? 1 : -1;
        return {
          ...prev,
          open_valves: prev.open_valves + delta,
          shutoff_valves: prev.shutoff_valves - delta,
        };
      });
    } catch (err) {
      console.error("[valve]", err);
    } finally {
      setValveToggling((prev) => {
        const next = { ...prev };
        delete next[houseId];
        return next;
      });
    }
  };

  // ─── Recharge ─────────────────────────────────────────────────────────────

  const openRecharge = (houseId) => {
    setRechargeState((prev) => ({
      ...prev,
      [houseId]: { open: true, amount: "", submitting: false, error: "" },
    }));
  };

  const closeRecharge = (houseId) => {
    setRechargeState((prev) => {
      const next = { ...prev };
      delete next[houseId];
      return next;
    });
  };

  const handleRechargeSubmit = async (houseId) => {
    const amount = Number(rechargeState[houseId]?.amount);
    if (!amount || amount <= 0) return;

    setRechargeState((prev) => ({
      ...prev,
      [houseId]: { ...prev[houseId], submitting: true, error: "" },
    }));

    try {
      const res = await prepaidRechargeHouse(zoneId, houseId, amount);
      const updated = res.data.house;

      setHouses((prev) =>
        prev.map((h) => (h.house_id === houseId ? updated : h))
      );

      // If the valve was just auto-reopened by the recharge, sync zone counts
      const prev = houses.find((h) => h.house_id === houseId);
      if (prev?.valve_status === "shutoff" && updated.valve_status === "open") {
        setZoneData((z) =>
          z
            ? { ...z, open_valves: z.open_valves + 1, shutoff_valves: z.shutoff_valves - 1 }
            : z
        );
      }

      // Update total credit
      const diff = updated.credit_balance_inr - (prev?.credit_balance_inr ?? 0);
      setZoneData((z) =>
        z ? { ...z, total_credit_inr: z.total_credit_inr + diff } : z
      );

      closeRecharge(houseId);
    } catch (err) {
      setRechargeState((prev) => ({
        ...prev,
        [houseId]: {
          ...prev[houseId],
          submitting: false,
          error: err?.response?.data?.message || "Recharge failed",
        },
      }));
    }
  };

  // ─── Derived chart data ────────────────────────────────────────────────────

  const chartSeries = useMemo(() => {
    if (!zoneData?.daily_series) return { labels: [], values: [] };
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    });
    return {
      labels: zoneData.daily_series.labels.map((d) =>
        formatter.format(new Date(`${d}T00:00:00`))
      ),
      values: zoneData.daily_series.values.map((v) =>
        Number((v / 1000).toFixed(2))
      ),
    };
  }, [zoneData]);

  // ─── Summary cards ─────────────────────────────────────────────────────────

  const summaryCards = useMemo(() => {
    if (!zoneData) return [];
    return [
      {
        title: "Total Houses",
        value: zoneData.total_houses,
        caption: "Active service connections",
      },
      {
        title: "Open Valves",
        value: zoneData.open_valves,
        caption: "Normal supply active",
        colorClass: "text-emerald-600",
      },
      {
        title: "Shutoff Valves",
        value: zoneData.shutoff_valves,
        caption: "Low or zero credit",
        colorClass: zoneData.shutoff_valves > 0 ? "text-red-500" : "text-gray-900",
      },
      {
        title: "Low Balance Alerts",
        value: zoneData.low_balance_count,
        caption: `Below ${fmt(zoneData.low_balance_threshold_inr)} threshold`,
        colorClass: zoneData.low_balance_count > 0 ? "text-amber-500" : "text-gray-900",
      },
      {
        title: "Total Zone Credit",
        value: fmt(zoneData.total_credit_inr),
        caption: "Aggregate prepaid balance",
      },
      {
        title: "Tariff Rate",
        value: fmt(zoneData.tariff_per_kl),
        caption: "per kL — city distribution",
      },
    ];
  }, [zoneData]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex">
      <div>
        <SideBar
          handleButtonOpen={() => setButtonOpen((v) => !v)}
          buttonOpen={buttonOpen}
        />
      </div>

      <div
        className={`${
          buttonOpen ? "ml-[200px] flex-grow" : "ml-[72px] flex-grow"
        } transition-all`}
      >
        <NavBar />

        <div className="pt-5 px-6 pb-10">

          {/* ── Zone header + summary cards ──────────────────────────────── */}
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Prepaid Water Zone</p>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {zoneData?.name ||
                    localStorage.getItem("apartment_name") ||
                    "Water Zone"}
                </h2>
                <p className="text-xs text-gray-500 mt-1">{zoneData?.address}</p>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="self-start md:self-auto text-sm px-4 py-2 rounded-lg border border-[#00A877] text-[#00A877] hover:bg-emerald-50 transition disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-6">
              {summaryCards.map((card) => (
                <SummaryCard key={card.title} {...card} />
              ))}
            </div>
          </section>

          {/* ── Zone consumption chart ────────────────────────────────────── */}
          {!loading && zoneData && (
            <section className="bg-white rounded-2xl shadow-sm mt-5 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                Zone consumption trend — last 30 days (kL)
              </h3>
              <BarChartComponent props={chartSeries} />
            </section>
          )}

          {/* ── House connections table ──────────────────────────────────── */}
          <section className="bg-white rounded-2xl shadow-sm mt-5">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">House connections</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Click a valve chip to toggle it. Use Recharge to top up a
                house's prepaid credit.
              </p>
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
                    <th className="px-4 py-3">House / Meter</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3 text-right">Today (L)</th>
                    <th className="px-4 py-3 text-right">30d (kL)</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                    <th className="px-4 py-3 text-right">Days left</th>
                    <th className="px-4 py-3 text-center">Valve</th>
                    <th className="px-4 py-3 text-center">Recharge</th>
                    <th className="px-4 py-3 text-center">QR</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Loading zone data…
                      </td>
                    </tr>
                  ) : (
                    houses.map((house) => {
                      const rs = rechargeState[house.house_id];
                      const isLow =
                        house.credit_balance_inr <
                        (zoneData?.low_balance_threshold_inr ?? 50);
                      const isZero = house.credit_balance_inr === 0;
                      const rowShutoff = house.valve_status === "shutoff";

                      return (
                        <tr
                          key={house.house_id}
                          className={`hover:bg-gray-50 ${
                            rowShutoff ? "bg-red-50/25" : ""
                          }`}
                        >
                          {/* House / Meter */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">
                              {house.house_id}
                            </p>
                            <p className="text-xs text-gray-400">
                              {house.meter_id}
                            </p>
                          </td>

                          {/* Resident */}
                          <td className="px-4 py-3">
                            <p className="text-gray-700">
                              {house.resident_name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {house.address}
                            </p>
                          </td>

                          {/* Today */}
                          <td className="px-4 py-3 text-right text-gray-900">
                            {house.today_litres.toLocaleString()}
                          </td>

                          {/* 30-day */}
                          <td className="px-4 py-3 text-right text-gray-900">
                            {(house.consumption_30d_litres / 1000).toFixed(2)}
                          </td>

                          {/* Credit balance */}
                          <td
                            className={`px-4 py-3 text-right font-medium ${
                              isZero
                                ? "text-red-600"
                                : isLow
                                ? "text-amber-500"
                                : "text-gray-900"
                            }`}
                          >
                            {fmt(house.credit_balance_inr)}
                            {isLow && (
                              <span className="ml-1 text-xs">
                                {isZero ? "⛔" : "⚠"}
                              </span>
                            )}
                          </td>

                          {/* Estimated days left */}
                          <td
                            className={`px-4 py-3 text-right ${
                              house.estimated_days_left !== null &&
                              house.estimated_days_left <= 3
                                ? "text-red-500 font-medium"
                                : "text-gray-900"
                            }`}
                          >
                            {house.estimated_days_left !== null
                              ? house.estimated_days_left
                              : "—"}
                          </td>

                          {/* Valve chip */}
                          <td className="px-4 py-3 text-center">
                            <ValveChip
                              status={house.valve_status}
                              toggling={!!valveToggling[house.house_id]}
                              onClick={() =>
                                handleValveToggle(
                                  house.house_id,
                                  house.valve_status
                                )
                              }
                            />
                          </td>

                          {/* Recharge */}
                          <td className="px-4 py-3 text-center min-w-[150px]">
                            {rs?.open ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-500">
                                    ₹
                                  </span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={rs.amount}
                                    onChange={(e) =>
                                      setRechargeState((prev) => ({
                                        ...prev,
                                        [house.house_id]: {
                                          ...prev[house.house_id],
                                          amount: e.target.value,
                                          error: "",
                                        },
                                      }))
                                    }
                                    placeholder="Amount"
                                    className="w-20 rounded-md border border-gray-200 py-1 px-2 text-xs focus:border-[#00A877] focus:outline-none focus:ring-1 focus:ring-[#8AE5C1]/50"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRechargeSubmit(house.house_id)
                                    }
                                    disabled={rs.submitting || !rs.amount}
                                    className="rounded-md bg-[#00A877] px-2 py-1 text-xs font-medium text-white hover:bg-[#008f64] disabled:opacity-50"
                                  >
                                    {rs.submitting ? "…" : "Add"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      closeRecharge(house.house_id)
                                    }
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {rs.error && (
                                  <p className="text-xs text-red-500">
                                    {rs.error}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openRecharge(house.house_id)}
                                className="rounded-md border border-[#00A877] px-3 py-1 text-xs font-medium text-[#00A877] hover:bg-emerald-50 transition"
                              >
                                Recharge
                              </button>
                            )}
                          </td>

                          {/* QR */}
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setQrHouse(house)}
                              title={`Show payment QR for ${house.house_id}`}
                              className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-[#00A877] hover:text-[#00A877] hover:bg-emerald-50 transition"
                            >
                              QR
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* QR modal */}
      {qrHouse && (
        <QRModal
          house={qrHouse}
          zoneId={zoneId}
          onClose={() => setQrHouse(null)}
        />
      )}
    </div>
  );
}

export default PrepaidDashboard;
