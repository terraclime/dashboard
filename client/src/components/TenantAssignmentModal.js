import React, { useEffect, useState } from "react";

const emptyForm = {
  resident_name: "",
  resident_email: "",
  resident_contact: "",
  start_date: "",
};

function TenantAssignmentModal({
  flatId,
  earliestStart,
  submitting = false,
  error = "",
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setForm({ ...emptyForm, start_date: earliestStart || "" });
  }, [flatId, earliestStart]);

  if (!flatId) return null;

  const update = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const submit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-tenant-title"
    >
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="assign-tenant-title" className="text-xl font-semibold text-gray-900">
              Assign new tenant
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Start a new occupancy for flat {flatId}. The previous tenant's bill remains unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xl text-gray-400 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Resident name
            <input
              type="text"
              required
              value={form.resident_name}
              onChange={update("resident_name")}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-normal focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
            />
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Email
            <input
              type="email"
              required
              value={form.resident_email}
              onChange={update("resident_email")}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-normal focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Contact (optional)
            <input
              type="tel"
              value={form.resident_contact}
              onChange={update("resident_contact")}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-normal focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Occupancy start date
            <input
              type="date"
              required
              min={earliestStart}
              value={form.start_date}
              onChange={update("start_date")}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-normal focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <p className="mt-4 text-xs text-gray-500">
          Water usage is attributed to this tenant from the selected start date. You can leave the flat vacant and assign someone later.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Leave vacant
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#00A877] px-4 py-2 text-sm font-medium text-white hover:bg-[#008f64] disabled:cursor-not-allowed disabled:bg-[#9dd8c4]"
          >
            {submitting ? "Assigning..." : "Assign tenant"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default TenantAssignmentModal;
