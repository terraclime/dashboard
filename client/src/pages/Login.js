import React, { useState } from "react";
import terraclimelogo from "../Utils/Images/Logo - Website.png";
import { faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faEnvelope,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { faCopyright as faCopyrightRegular } from "@fortawesome/free-regular-svg-icons";
import { Mail01Icon } from "hugeicons-react";
import { loginRequest } from "../api/endpoints";
import { useNavigate } from "react-router-dom";

function Login() {
  const [formData, setFormData] = useState({
    user_mail: "",
    user_password: "",
  });

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputType, setInputType] = useState("password");

  const [eyeOpen, setEyeOpen] = useState(false);

  const handleEyeOpen = () => {
    setEyeOpen(!eyeOpen);
    setInputType(inputType === "password" ? "text" : "password");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) {
      return;
    }

    setError("");
    if (!formData.user_mail || !formData.user_password) {
      setError("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await loginRequest(formData);
      if (result.status === 200) {
        const { accessToken, role, account_type, apartment, user } = result.data;

        if (!accessToken) {
          throw new Error("Login response did not include an access token");
        }

        const userMail = user?.mail || formData.user_mail;
        const userName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();

        localStorage.setItem("token", accessToken);
        localStorage.setItem("jwt_token", accessToken);
        localStorage.setItem("role", role || "");
        localStorage.setItem("user_mail", userMail);
        localStorage.setItem("account_type", account_type || "standard");
        localStorage.setItem("apartment_id", apartment?.id || "");
        localStorage.setItem("apartment_name", apartment?.name || "");
        localStorage.setItem("user_name", userName || userMail);
        sessionStorage.setItem("role", role || "");

        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("Login failed:", err);
      if (err.response?.status === 401) {
        setError("Incorrect email or password. Try again.");
      } else {
        setError("Unable to reach the server. Please try again in a moment.");
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-[#E6FEE9] flex flex-col items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white shadow-xl rounded-3xl p-10 space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <img src={terraclimelogo} className="w-56" alt="Terraclime" />
          <h1 className="text-xl font-semibold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 text-center">
            Sign in to monitor consumption, leaks, and billing for your community.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col space-y-2 text-left">
            <label className="text-sm font-medium text-gray-600" htmlFor="user_mail">
              Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#00A877]">
                <Mail01Icon size={18} />
              </span>
              <input
                id="user_mail"
                type="email"
                name="user_mail"
                value={formData.user_mail}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                placeholder="name@example.com"
              />
            </div>
          </div>
          <div className="flex flex-col space-y-2 text-left">
            <label className="text-sm font-medium text-gray-600" htmlFor="user_password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#00A877]">
                <FontAwesomeIcon icon={faLock} />
              </span>
              <button
                type="button"
                onClick={handleEyeOpen}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FontAwesomeIcon icon={eyeOpen ? faEye : faEyeSlash} />
              </button>
              <input
                id="user_password"
                type={inputType}
                name="user_password"
                value={formData.user_password}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-10 text-sm focus:border-[#00A877] focus:outline-none focus:ring-2 focus:ring-[#8AE5C1]/50"
                placeholder="Enter your password"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <a href="/forgot-password" className="text-sm text-[#00A877] hover:underline">
              Forgot password?
            </a>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="w-full rounded-lg bg-[#00A877] py-2 text-white text-sm font-semibold shadow-sm hover:bg-[#008a63] transition-colors disabled:cursor-not-allowed disabled:bg-[#72cdb3] flex items-center justify-center gap-2"
          >
            {isLoading && (
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            )}
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="pt-4 border-t border-gray-100 text-center space-y-3">
          <p className="text-sm text-gray-500">Reach us at</p>
          <div className="flex justify-center gap-10 text-[#00A877] text-xl">
            <a
              href="https://www.linkedin.com/company/terraclime/"
              aria-label="Terraclime on LinkedIn"
              target="_blank"
              rel="noreferrer"
            >
              <FontAwesomeIcon icon={faLinkedin} />
            </a>
            <a href="mailto:info@terraclime.com" aria-label="Email Terraclime">
              <FontAwesomeIcon icon={faEnvelope} />
            </a>
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-gray-500 flex items-center gap-2">
        <FontAwesomeIcon icon={faCopyrightRegular} /> {new Date().getFullYear()} Terraclime Technologies. All rights reserved.
      </p>
    </div>
  );
}
export default Login;
