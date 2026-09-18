import React, { useState } from "react";
import terraclimelogo from "../Utils/Images/Logo - Website.png";
import {
  faInstagram,
  faLinkedin,
  faMeta,
  faTwitter,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faEye,
  faEyeDropper,
  faEyeSlash,
  faX,
} from "@fortawesome/free-solid-svg-icons";

function ForgotPassword() {
  const [formData, setFormData] = useState({});
  const [inputType, setInputType] = useState("password");
  const [eyeOpen, setEyeOpen] = useState(false);
  const handleEyeOpen = () => {
    setEyeOpen(!eyeOpen);
    setInputType(inputType === "password" ? "text" : "password");
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      alert("Password reset instructions will be shared soon.");
    } catch (err) {
      console.error(err);
    }
  };
  const handleChange = async () => {};
  return (
    <div className="bg-[#00A877] h-screen">
      <div className="flex justify-center items-center">
        <div className="w-[75%] my-[50px]">
          <div className="grid grid-cols-2 bg-white shadow-xl rounded-xl pb-10">
            <div className="border border-l-0 m-3 border-r-2 border-t-0 border-b-0">
              <div></div>
              <img
                src={terraclimelogo}
                className="w-[360px] md:[360px] lg:w-[340px] mx-12 mt-10"
              />
            </div>
            <div className="">
              <div className="text-2xl mt-[70px] font-bold">
                Forgot Password
              </div>
              <div className="mt-10">
                <div className="relative">
                  <div className="absolute ms-[106px] border p-[9px] border border-b-0 border-t-0 border-l-0 border-[#ffffff]">
                    <FontAwesomeIcon icon={faEnvelope} />
                  </div>
                  <input
                    type="text"
                    className="border bg-gray-200 w-[60%] p-2 rounded-xl focus:ring-offset-0 focus:ring-0 focus:outline-none ps-12"
                    placeholder="Enter your username"
                  />
                </div>
                <div className="relative">
                  <div className="absolute ms-[106px] border p-[9px] border border-b-0 border-t-0 border-l-0 border-[#ffffff]">
                    <button onClick={handleEyeOpen}>
                      <FontAwesomeIcon icon={eyeOpen ? faEye : faEyeSlash} />
                    </button>
                  </div>
                  <div className="mt-6 mb-2">
                    <input
                      type={inputType}
                      className="border bg-gray-200 w-[60%] p-2 rounded-xl focus:ring-offset-0 focus:ring-0 focus:outline-none ps-12"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>
              </div>
              <div>
                <a
                  href="/forgot-password"
                  className="text-[#00A877] text-sm mt-3"
                >
                  Forgot password?
                </a>
              </div>
              <div className="mb-2 mt-4">
                <button className="text-white bg-[#00A877] py-2 rounded-xl px-3">
                  Sign in
                </button>
              </div>
              <div className="flex justify-between mx-24 mt-6">
                <div className="text-2xl text-[#00A877]">
                  <FontAwesomeIcon icon={faTwitter} />
                </div>
                <div className="text-2xl text-[#00A877]">
                  <FontAwesomeIcon icon={faInstagram} />
                </div>
                <div className="text-2xl text-[#00A877]">
                  <FontAwesomeIcon icon={faLinkedin} />
                </div>
                <div className="text-2xl text-[#00A877]">
                  <FontAwesomeIcon icon={faMeta} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
