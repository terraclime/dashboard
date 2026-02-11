import { login } from "../services/authService.js";

export const loginController = async (req, res) => {
  const { user_mail, user_password } = req.body;

  if (!user_mail || !user_password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const result = await login(user_mail, user_password);
    res.status(200).json({
      accessToken: result.token,
      role: result.role,
      apartment: result.apartment,
      user: result.user,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid credentials" });
  }
};
