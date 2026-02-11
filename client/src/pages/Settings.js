import React, { useEffect, useState } from "react";
import SideBar from "../components/SideBar";
import NavBar from "../components/NavBar";
import { fetchProfile } from "../api/endpoints";

function Settings() {
  const [buttonOpen, setButtonOpen] = useState(true);
  const [profile, setProfile] = useState(null);
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
        const userMail = localStorage.getItem("user_mail");
        const response = await fetchProfile(userMail);
        setProfile(response.data);
      } catch (err) {
        console.error(err);
        setError("Unable to load profile at the moment.");
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className={`flex`}>
      <div className="">
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
        <div className="pt-5 px-6 pb-10">
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Account settings
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage your contact details and community information.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mt-4">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs uppercase text-gray-500">Name</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {profile
                    ? `${profile.user.first_name} ${profile.user.last_name}`
                    : loading
                    ? "Loading..."
                    : "-"}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {profile?.user?.mail}
                </p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs uppercase text-gray-500">Role</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {profile?.user?.role || "-"}
                </p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs uppercase text-gray-500">Apartment</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {profile?.apartment?.name || "-"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {profile?.apartment?.address || ""}
                </p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs uppercase text-gray-500">Billing cycle</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {profile?.apartment?.billing_cycle?.label || "-"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {profile?.apartment?.billing_cycle
                    ? `${profile.apartment.billing_cycle.period_start} → ${profile.apartment.billing_cycle.period_end}`
                    : ""}
                </p>
              </div>
            </div>
          </section>
          <section className="bg-white rounded-2xl shadow-sm mt-5 p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Coming soon
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              Update password, configure alerts, and customise notification
              preferences directly from this page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Settings;
