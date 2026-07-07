import React from "react";
import { NavLink } from "react-router-dom";
import terraclimelogo from "../Utils/Images/Logo - Website.png";
import terraclimesymbol from "../Utils/Images/Logo - Website(1)(1).png";

const navItems = [
  { label: "Overview", path: "/overview" },
  { label: "Reports", path: "/reports" },
  { label: "Leaks", path: "/leaks" },
  { label: "Billing", path: "/current-billingcycle" },
  { label: "Settings", path: "/settings" },
];

function SideBar({ handleButtonOpen, buttonOpen }) {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen border-r bg-white shadow-sm transition-all ${
        buttonOpen ? "w-[200px]" : "w-[72px]"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-6">
        <img
          src={buttonOpen ? terraclimelogo : terraclimesymbol}
          alt="Terraclime"
          className={buttonOpen ? "w-[140px]" : "w-[36px]"}
        />
        <button
          onClick={handleButtonOpen}
          className="text-[#00A877] text-sm font-medium"
        >
          {buttonOpen ? "◀" : "▶"}
        </button>
      </div>
      <nav className="px-2">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-[#E6FEE9] text-[#007151]"
                      : "text-gray-600 hover:bg-gray-100",
                    buttonOpen ? "" : "justify-center",
                  ].join(" ")
                }
              >
                <span className="font-medium">
                  {buttonOpen ? item.label : item.label.charAt(0)}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-400">
        v1.0.0
      </div>
    </aside>
  );
}
export default SideBar;
