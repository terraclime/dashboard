import React from "react";
import terraclimelogo from "../Utils/Images/Logo - Website.png";

const Register = () => {
  return (
    <div className="bg-[#E6FEE9] min-h-screen flex flex-col items-center justify-center text-center px-4">
      <img src={terraclimelogo} className="w-[220px] mb-8" alt="Terraclime" />
      <div className="bg-white shadow-xl rounded-2xl max-w-lg w-full p-10">
        <h1 className="text-2xl font-semibold text-gray-900">
          Self-service sign up coming soon
        </h1>
        <p className="text-sm text-gray-600 mt-4">
          We are onboarding resident welfare associations manually during the
          pilot. Please contact <strong>support@terraclime.com</strong> or your
          Terraclime success manager to provision new user accounts.
        </p>
        <div className="mt-8">
          <a
            href="/"
            className="inline-block px-4 py-2 text-sm font-medium text-white bg-[#00A877] rounded-lg hover:bg-[#008a63]"
          >
            Return to login
          </a>
        </div>
      </div>
      <p className="mt-6 text-xs text-gray-500">
        © {new Date().getFullYear()} Terraclime. All rights reserved.
      </p>
    </div>
  );
};

export default Register;
