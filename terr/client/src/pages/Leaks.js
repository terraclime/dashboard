import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import SideBar from "../components/SideBar";
import LeaksAcrossBlocks from "../components/LeaksAcrossBlocks";
import { fetchLeakSummary } from "../api/endpoints";
import BarChartComponent from "../components/Chart";

function Leaks() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [leakData, setLeakData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const handleButtonOpen = () => {
    setButtonOpen(!buttonOpen);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const apartmentId = localStorage.getItem("apartment_id");
        const response = await fetchLeakSummary(apartmentId);
        setLeakData(response.data);
      } catch (err) {
        console.error(err);
        setError("Unable to load leak analytics right now.");
      }
      setLoading(false);
    };
    load();
  }, []);

  const timelineChartData = useMemo(() => {
    if (!leakData?.summary?.timeline) return null;
    return {
      labels: leakData.summary.timeline.map((entry) =>
        new Date(entry.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      ),
      values: leakData.summary.timeline.map((entry) => entry.litres),
    };
  }, [leakData]);

  const summaryCards = [
    {
      label: "Leaks this cycle",
      value: leakData?.summary?.total_leaks_current_cycle ?? "-",
    },
    {
      label: "Active alerts",
      value: leakData?.summary?.active_alerts ?? 0,
    },
    {
      label: "Total litres impacted",
      value: leakData?.summary?.blocks
        ?.reduce((sum, block) => sum + block.litres, 0)
        ?.toLocaleString() || "-",
    },
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
        <div className="pt-5 px-6 pb-8">
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">
                Leak insights
              </h1>
              <p className="text-sm text-gray-500">
                Track leak alerts and volume impacted across your community.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className="border border-gray-100 rounded-xl p-4 bg-gradient-to-br from-white to-green-50"
                >
                  <p className="text-xs uppercase text-gray-500">
                    {card.label}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 mt-2">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">
                Leaks by block
              </h2>
              {loading ? (
                <div className="text-sm text-gray-500">Loading chart...</div>
              ) : (
                <LeaksAcrossBlocks blocks={leakData?.summary?.blocks || []} />
              )}
            </div>
            <div className="lg:col-span-2 bg-white rounded-2xl p-4 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">
                Leak volume timeline
              </h2>
              {timelineChartData ? (
                <BarChartComponent props={timelineChartData} />
              ) : (
                <div className="text-sm text-gray-500">
                  {loading ? "Loading timeline..." : "No leak batches recorded."}
                </div>
              )}
            </div>
          </section>
          <section className="bg-white rounded-2xl shadow-sm mt-5 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">
              Latest leak alerts
            </h2>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
            )}
            {loading ? (
              <div className="text-sm text-gray-500">Loading alerts...</div>
            ) : leakData?.recent_events?.length ? (
              <div className="space-y-3">
                {leakData.recent_events.map((event, index) => (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className="border border-gray-100 rounded-xl px-4 py-3 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {event.flat_id} · {event.source}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {event.litres} L
                      </p>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          event.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                No leak alerts raised in the last few days.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export default Leaks;
