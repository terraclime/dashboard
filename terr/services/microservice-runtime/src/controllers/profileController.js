import { getProfile, getSettingsProfile } from "../services/profileService.js";

export const profileController = async (req, res) => {
  const { user_mail } = req.query;
  if (!user_mail) {
    return res.status(400).json({ message: "user_mail query param required" });
  }

  try {
    const profile = await getProfile(user_mail);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Failed to load profile" });
  }
};

export const settingsProfileController = async (req, res) => {
  const { user_mail } = req.query;
  if (!user_mail) {
    return res.status(400).json({ message: "user_mail query param required" });
  }

  try {
    const profile = await getSettingsProfile(user_mail);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.status(200).json(profile);
  } catch (error) {
    console.error("Failed to load settings profile", {
      user_mail,
      errorName: error?.name,
      errorCode: error?.code || error?.Code,
      message: error?.message,
    });

    const response = { message: "Failed to load settings profile" };
    if (process.env.NODE_ENV !== "production") {
      response.details = {
        errorName: error?.name || "Error",
        errorCode: error?.code || error?.Code || null,
        errorMessage: error?.message || "Unknown error",
      };
    }

    res.status(500).json(response);
  }
};
