import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

function NavBar() {
  const currentPath = window.location.pathname;

  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("role");
    localStorage.removeItem("apartment_id");
    localStorage.removeItem("apartment_name");
    localStorage.removeItem("user_name");
    navigate("/"); // redirect to login or home page
  };

  const pageTitle = useMemo(() => {
    const titles = {
      "/overview": "Overview",
      "/dashboard": "Overview",
      "/reports": "Reports",
      "/leaks": "Leak Insights",
      "/settings": "Settings",
      "/current-billingcycle": "Billing",
    };
    return titles[currentPath] || "Terraclime";
  }, [currentPath]);

  const userName =
    localStorage.getItem("user_name") ||
    localStorage.getItem("user_mail") ||
    "Guest";

  return (
    <div className="bg-white shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between px-6 py-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500">
            {localStorage.getItem("apartment_name") || "Terraclime Demo"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{userName}</p>
            <p className="text-xs text-gray-500">RWA Admin</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm px-4 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
export default NavBar;
