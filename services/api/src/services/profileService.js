import { getLiveUserProfile } from "./analyticsStore.service.js";

export const getProfile = async (userMail) => {
  const profile = await getLiveUserProfile(userMail);

  if (!profile) {
    return null;
  }

  const { userRecord: user, apartment } = profile;

  return {
    user: {
      mail: user.user_mail,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
    apartment: {
      id: apartment.apartment_id,
      name: apartment.apartment_name,
      address: apartment.address,
      billing_cycle: apartment.billing_cycle,
    },
  };
};
