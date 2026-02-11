import { getProfile } from "../services/profileService.js";

export const profileController = async (req, res) => {
  const { user_mail } = req.query;
  if (!user_mail) {
    return res.status(400).json({ message: "user_mail query param required" });
  }

  try {
    const profile = getProfile(user_mail);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Failed to load profile" });
  }
};
