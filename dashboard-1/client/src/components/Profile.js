import React from "react";
import {
  Notification03Icon,
  UserSharingIcon,
  AirdropIcon,
  PaintBrush01Icon,
  CpuIcon,
  WaterEnergyIcon,
} from "hugeicons-react";
function Profile() {
  return (
    <div className="border w-[33%] ms-auto absolute left-[913px] h-screen bg-white">
      <div className="bg-gray-100">
        <div className="flex justify-center items-center">
          <div className="bg-white w-[90%] my-2 pb-2 rounded-lg">
            <div className="flex justify-center items-center pt-6 text-gray-400">
              <UserSharingIcon size={50} />
            </div>
            <div className="text-md pt-2 font-semibold">Shoba Apartments</div>
            <div className="text-sm pt-1">user@shoba.com</div>
            <div className="pt-1 text-sm">
              <span>Terraclime User ID:</span> 45678998
            </div>
            <div className="grid grid-cols-2 pt-5 gap-10 mx-10">
              <button className="border rounded-xl bg-gray-100 text-sm py-1 ">
                My account
              </button>
              <button className="bg-[#00A877] rounded-xl text-sm text-white py-1">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
