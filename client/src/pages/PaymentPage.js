import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import terraclimelogo from "../Utils/Images/Logo - Website.png";
import { apiClient } from "../api/client";

const PRESET_AMOUNTS = [50, 100, 200, 500];
const fmt = (v) => `\u20B9${Number(v).toLocaleString("en-IN")}`;

// ─── Screens ─────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#E6FEE9] flex items-center justify-center">
      <p className="text-gray-500 text-sm">Loading house details…</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-[#E6FEE9] flex flex-col items-center justify-center px-6 gap-4">
      <p className="text-red-600 font-medium text-center">{message}</p>
      <p className="text-gray-500 text-xs text-center">
        Please check the QR code or contact your zone operator.
      </p>
    </div>
  );
}

function SuccessScreen({ house, paidAmount, onDone }) {
  const valveJustOpened =
    house.valve_status === "open" &&
    house.credit_balance_inr >= 50;

  return (
    <div className="min-h-screen bg-[#E6FEE9] flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-5">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-3xl">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Payment successful</h2>
          <p className="text-sm text-gray-500 mt-1">
            {fmt(paidAmount)} added to your account
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">House</span>
            <span className="font-medium text-gray-900">{house.house_id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Resident</span>
            <span className="font-medium text-gray-900">{house.resident_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">New balance</span>
            <span className="font-semibold text-emerald-600">
              {fmt(house.credit_balance_inr)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Est. days left</span>
            <span className="font-medium text-gray-900">
              {house.estimated_days_left ?? "—"} days
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Water supply</span>
            <span
              className={`font-medium ${
                house.valve_status === "open"
                  ? "text-emerald-600"
                  : "text-red-500"
              }`}
            >
              {house.valve_status === "open" ? "Active" : "Shutoff"}
            </span>
          </div>
        </div>

        {valveJustOpened && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
            Your water supply has been restored automatically.
          </div>
        )}

        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-[#00A877] py-3 text-white text-sm font-semibold shadow-sm hover:bg-[#008a63] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Main payment page ────────────────────────────────────────────────────────

function PaymentPage() {
  const { houseId } = useParams();
  const [searchParams] = useSearchParams();
  const zoneId = searchParams.get("zone");

  const [house, setHouse] = useState(null);
  const [zone, setZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paid, setPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [updatedHouse, setUpdatedHouse] = useState(null);

  useEffect(() => {
    if (!houseId || !zoneId) {
      setFetchError("Invalid payment link.");
      setLoading(false);
      return;
    }

    apiClient
      .get(`/prepaid/house/${houseId}`, { params: { zone_id: zoneId } })
      .then((res) => {
        setHouse(res.data.house);
        setZone(res.data.zone);
      })
      .catch(() => setFetchError("House not found. Please check your QR code."))
      .finally(() => setLoading(false));
  }, [houseId, zoneId]);

  const effectiveAmount =
    selectedAmount !== null
      ? selectedAmount
      : Number(customAmount) > 0
      ? Number(customAmount)
      : 0;

  const handlePay = async () => {
    if (!effectiveAmount || effectiveAmount <= 0) return;
    setPayError("");
    setPaying(true);

    try {
      const res = await apiClient.post("/prepaid/recharge", {
        zone_id: zoneId,
        house_id: houseId,
        amount: effectiveAmount,
      });
      setPaidAmount(effectiveAmount);
      setUpdatedHouse(res.data.house);
      setPaid(true);
    } catch (err) {
      setPayError(
        err?.response?.data?.message || "Payment failed. Please try again."
      );
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (fetchError) return <ErrorScreen message={fetchError} />;
  if (paid)
    return (
      <SuccessScreen
        house={updatedHouse}
        paidAmount={paidAmount}
        onDone={() => window.location.reload()}
      />
    );

  const isLow = house.credit_balance_inr < (zone?.low_balance_threshold_inr ?? 50);
  const isShutoff = house.valve_status === "shutoff";

  return (
    <div className="min-h-screen bg-[#E6FEE9] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">

        {/* Logo */}
        <div className="text-center mb-2">
          <img src={terraclimelogo} alt="Terraclime" className="w-40 mx-auto" />
          <p className="text-xs text-gray-500 mt-1">Prepaid Water Recharge</p>
        </div>

        {/* House info card */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {zone?.name}
              </p>
              <p className="font-semibold text-gray-900 mt-0.5">
                {house.resident_name}
              </p>
              <p className="text-xs text-gray-500">{house.address}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium mt-0.5 ${
                isShutoff
                  ? "bg-red-100 text-red-600"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isShutoff ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              {isShutoff ? "Shutoff" : "Active"}
            </span>
          </div>

          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500">Current balance</p>
              <p
                className={`text-xl font-bold mt-0.5 ${
                  isLow ? "text-red-500" : "text-gray-900"
                }`}
              >
                {fmt(house.credit_balance_inr)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Est. days left</p>
              <p
                className={`text-xl font-bold mt-0.5 ${
                  (house.estimated_days_left ?? 99) <= 3
                    ? "text-amber-500"
                    : "text-gray-900"
                }`}
              >
                {house.estimated_days_left ?? "—"}
              </p>
            </div>
          </div>

          {isShutoff && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
              Your water supply is shutoff due to low balance. Recharge{" "}
              {fmt(zone?.low_balance_threshold_inr ?? 50)} or more to restore supply automatically.
            </div>
          )}
        </div>

        {/* Amount selection */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Select amount</p>

          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setSelectedAmount(amt);
                  setCustomAmount("");
                  setPayError("");
                }}
                className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                  selectedAmount === amt
                    ? "border-[#00A877] bg-emerald-50 text-[#00A877]"
                    : "border-gray-200 text-gray-700 hover:border-[#00A877] hover:bg-emerald-50"
                }`}
              >
                {fmt(amt)}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm font-medium pointer-events-none">
              ₹
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
                setPayError("");
              }}
              placeholder="Or enter custom amount"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-8 pr-4 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
            />
          </div>

          {payError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {payError}
            </p>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={!effectiveAmount || paying}
            className="w-full rounded-xl bg-[#00A877] py-3 text-white text-sm font-semibold shadow-sm hover:bg-[#008a63] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {paying
              ? "Processing…"
              : effectiveAmount
              ? `Pay ${fmt(effectiveAmount)}`
              : "Pay Now"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Demo mode — no real payment is processed
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          House {house.house_id} · Meter {house.meter_id}
        </p>
      </div>
    </div>
  );
}

export default PaymentPage;
