import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import TenantAssignmentModal from "../components/TenantAssignmentModal";
import { ViewIcon } from "hugeicons-react";
import { BlockDonutChart, InactiveDevice } from "../components/BlockWiseStats";
import {
  assignFlatOccupancy,
  fetchReportsOverview,
  updateFlatOccupancy,
} from "../api/endpoints";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faCheck } from "@fortawesome/free-solid-svg-icons";

const addIsoDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function Reports() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const handleButtonOpen = () => {
    setButtonOpen(!buttonOpen);
  };
  const [reportsApi, setReportsApi] = useState(null);
  const [flatConsumptionMap, setFlatConsumptionMap] = useState({});
  const [flatHealthMap, setFlatHealthMap] = useState({});
  const [residentDirectory, setResidentDirectory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editState, setEditState] = useState({});
  const [assignmentEntry, setAssignmentEntry] = useState(null);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  const handleApiReports = async () => {
    try {
      setLoading(true);
      setError("");
      const apartmentId = localStorage.getItem("apartment_id");
      const result = await fetchReportsOverview(apartmentId);
      setReportsApi(result.data);
      setFlatConsumptionMap(result.data.flatConsumptionMap || {});
      setFlatHealthMap(result.data.flatHealthMap || {});
      const directory = (result.data.flatDetails || []).map((entry) => ({
        flat_id: entry.flat_id,
        bill_flat_id: entry.bill_flat_id || entry.flat_id,
        flat_number: entry.flat_number || entry.flat_id,
        block_id: entry.block_id,
        resident_name: entry.resident_name,
        resident_email: entry.resident_email || "",
        resident_contact: entry.resident_contact || "",
        resident_status: entry.resident_status || "occupied",
        occupancy_id: entry.occupancy_id || "",
        occupancy_start_date: entry.occupancy_start_date || "",
        vacated_at: entry.vacated_at || "",
      }));
      setResidentDirectory(directory);
      setEditState(
        directory.reduce((acc, entry) => {
          acc[entry.flat_id] = { editing: false, saving: false, error: "" };
          return acc;
        }, {})
      );
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Unable to load reports at the moment.");
      setLoading(false);
    }
  };
  const handleResidentChange = (flatId, field, value) => {
    setResidentDirectory((prev) =>
      prev.map((entry) =>
        entry.flat_id === flatId ? { ...entry, [field]: value } : entry
      )
    );
  };
  const toggleEditState = async (resident) => {
    const flatId = resident.flat_id;
    const billingFlatId = resident.bill_flat_id || flatId;
    const current = editState[flatId] || {};
    if (!current.editing) {
      setEditState((previous) => ({
        ...previous,
        [flatId]: { editing: true, saving: false, error: "" },
      }));
      return;
    }

    setEditState((previous) => ({
      ...previous,
      [flatId]: { ...previous[flatId], saving: true, error: "" },
    }));
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      const response = await updateFlatOccupancy(billingFlatId, {
        apartment_id: apartmentId,
        occupancy_id: resident.occupancy_id,
        resident_name: resident.resident_name,
        resident_email: resident.resident_email,
        resident_contact: resident.resident_contact,
      });
      const occupancy = response.data.occupancy;
      setResidentDirectory((previous) => previous.map((entry) =>
        entry.flat_id === flatId
          ? {
              ...entry,
              resident_name: occupancy.resident_name,
              resident_email: occupancy.resident_email,
              resident_contact: occupancy.resident_contact,
              occupancy_id: occupancy.occupancy_id,
            }
          : entry
      ));
      setEditState((previous) => ({
        ...previous,
        [flatId]: { editing: false, saving: false, error: "" },
      }));
    } catch (err) {
      setEditState((previous) => ({
        ...previous,
        [flatId]: {
          ...previous[flatId],
          saving: false,
          error: err?.response?.data?.message || err.message || "Unable to save tenant details.",
        },
      }));
    }
  };

  const handleAssignTenant = async (form) => {
    if (!assignmentEntry) return;
    setAssignmentSubmitting(true);
    setAssignmentError("");
    try {
      const apartmentId = localStorage.getItem("apartment_id");
      const response = await assignFlatOccupancy(
        assignmentEntry.bill_flat_id || assignmentEntry.flat_id,
        {
        apartment_id: apartmentId,
        ...form,
        }
      );
      const occupancy = response.data.occupancy;
      setResidentDirectory((previous) => previous.map((entry) =>
        entry.flat_id === assignmentEntry.flat_id
          ? {
              ...entry,
              resident_name: occupancy.resident_name,
              resident_email: occupancy.resident_email,
              resident_contact: occupancy.resident_contact,
              resident_status: occupancy.resident_status,
              occupancy_id: occupancy.occupancy_id,
              occupancy_start_date: occupancy.occupancy_start_date,
              vacated_at: "",
            }
          : entry
      ));
      setAssignmentEntry(null);
    } catch (err) {
      setAssignmentError(
        err?.response?.data?.message || err.message || "Unable to assign the tenant."
      );
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const filteredDirectory = useMemo(() => {
    if (!searchQuery) return residentDirectory;
    return residentDirectory.filter((entry) =>
      [entry.flat_id, entry.flat_number, entry.bill_flat_id]
        .some((value) => String(value || "").toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [residentDirectory, searchQuery]);
  useEffect(() => {
    handleApiReports();
  }, []);
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
        <div className="pt-5">
          <section className="px-5">
            <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-gray-900">
                Consumption & Device Health
              </h2>
              <p className="text-sm text-gray-500">
                High-level view of water usage and device health across blocks.
              </p>
            </div>
          </section>
          <section className="px-5 mt-4 mb-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
            )}
            {loading ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
                Loading reports...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="col-span-2 bg-white rounded-2xl p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900">
                    Consumption across blocks
                  </h3>
                  {reportsApi ? (
                    <BlockDonutChart props={reportsApi} />
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-gray-500">
                      No data available
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900">
                    Inactive device share
                  </h3>
                  {reportsApi ? (
                    <InactiveDevice props={reportsApi} />
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-gray-500">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className="px-5 pb-8">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Flat overview</h3>
              </div>
              <div className="px-4 py-3 flex justify-end">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by flat ID"
                  className="w-full md:w-60 rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-600 focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Flat</th>
                      <th className="px-4 py-3">Resident</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3 text-right">Consumption (L)</th>
                      <th className="px-4 py-3 text-right">Active devices</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {!loading &&
                      filteredDirectory.map((resident) => {
                        const flatId = resident.flat_id;
                        const consumption = Math.round(
                          flatConsumptionMap[flatId] || 0
                        );
                        const health = flatHealthMap[flatId] || {
                          active: 0,
                          total: 0,
                        };
                        const isVacant = resident.resident_status === "vacant";
                        const editing = editState[flatId]?.editing;
                        const saving = editState[flatId]?.saving;
                        const editError = editState[flatId]?.error;
                        return (
                          <tr key={flatId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {resident.flat_number || flatId}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {isVacant ? (
                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Vacant</span>
                              ) : (
                                <div>
                                  {editing ? (
                                  <input
                                    type="text"
                                    value={resident.resident_name}
                                    onChange={(event) =>
                                      handleResidentChange(
                                        flatId,
                                        "resident_name",
                                        event.target.value
                                      )
                                    }
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1 px-2 text-sm focus:border-[#00A877] focus:outline-none focus:ring-1 focus:ring-[#8AE5C1]/50"
                                  />
                                ) : (
                                  <span>{resident.resident_name}</span>
                                )}
                                  {editError && <p className="mt-1 max-w-xs text-xs text-red-600">{editError}</p>}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {isVacant ? "-" : editing ? (
                                  <input
                                    type="email"
                                    value={resident.resident_email}
                                    onChange={(event) =>
                                      handleResidentChange(
                                        flatId,
                                        "resident_email",
                                        event.target.value
                                      )
                                    }
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1 px-2 text-sm focus:border-[#00A877] focus:outline-none focus:ring-1 focus:ring-[#8AE5C1]/50"
                                  />
                                ) : (
                                  <span>{resident.resident_email}</span>
                                )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {isVacant ? "-" : editing ? (
                                <input
                                  type="tel"
                                  value={resident.resident_contact}
                                  onChange={(event) =>
                                    handleResidentChange(flatId, "resident_contact", event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1 px-2 text-sm focus:border-[#00A877] focus:outline-none focus:ring-1 focus:ring-[#8AE5C1]/50"
                                />
                              ) : resident.resident_contact || "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900">
                              {consumption.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center justify-end gap-2">
                                <span className="text-gray-900 font-medium">
                                  {health.active}
                                </span>
                                <span className="text-xs text-gray-500">
                                  / {health.total}
                                </span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-3">
                                {isVacant ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssignmentEntry(resident);
                                      setAssignmentError("");
                                    }}
                                    className="rounded-md bg-[#00A877] px-3 py-1 text-xs font-medium text-white hover:bg-[#008f64]"
                                  >
                                    Assign tenant
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    className="inline-flex items-center gap-1 text-[#00A877] hover:text-[#007151] disabled:opacity-50"
                                    onClick={() => toggleEditState(resident)}
                                  >
                                    <FontAwesomeIcon icon={editing ? faCheck : faPen} />
                                    {saving ? "Saving..." : editing ? "Save" : "Edit tenant"}
                                  </button>
                                )}
                                <Link
                                  className="inline-flex items-center gap-2 text-[#00A877] hover:text-[#007151] font-medium"
                                  to={`/reports/${flatId}`}
                                >
                                  <ViewIcon size={18} />
                                  View
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <TenantAssignmentModal
            flatId={assignmentEntry?.flat_number || assignmentEntry?.flat_id || ""}
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
export default Reports;
