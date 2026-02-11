import { demoApartment, demoUsers } from "../data/demoData.js";

export const getProfile = (userMail) => {
  const user = demoUsers.find(
    (record) => record.user_mail.toLowerCase() === userMail.toLowerCase()
  );

  if (!user) {
    return null;
  }

  return {
    user: {
      mail: user.user_mail,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
    apartment: {
      id: demoApartment.apartment_id,
      name: demoApartment.apartment_name,
      address: demoApartment.address,
      billing_cycle: demoApartment.billing_cycle,
    },
  };
};
