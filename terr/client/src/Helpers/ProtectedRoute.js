import { Navigate, Outlet } from "react-router-dom";
function ProtectedRoutes({ requiredRoles }) {
  let role = localStorage.getItem("role") || sessionStorage.getItem("role");
  let token = localStorage.getItem("token") || localStorage.getItem("jwt_token");

  if (!token || !role) {
    return <Navigate to="/" />;
  }
  if (requiredRoles && !requiredRoles.includes(role)) {
    return <Navigate to="/" />;
  }
  return <Outlet />;
}
export default ProtectedRoutes;
