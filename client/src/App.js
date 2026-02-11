// import logo from "./logo.svg";
import "./App.css";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
// import SideBar from './components/SideBar';
import Profile from "./components/Profile";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Leaks from "./pages/Leaks";
import IndividualReports from "./pages/IndividualReports";
import Bill from "./pages/Bill";
import Register from "./pages/Register";
import ProtectedRoutes from "./Helpers/ProtectedRoute";

function App() {
  return (
    <div className="App dm-sans">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          {/* <Route path="/register" element={<Register />} /> */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route element={<ProtectedRoutes requiredRoles={["user"]} />}>
            <Route path="/overview" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/leaks" element={<Leaks />} />
            <Route path="/reports/:id" element={<IndividualReports />} />
            <Route path="/current-billingcycle" element={<Bill />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}
export default App;
