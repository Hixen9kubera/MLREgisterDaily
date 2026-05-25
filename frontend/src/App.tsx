import { Link, NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Goals from "./pages/Goals";
import Competidores from "./pages/Competidores";
import { NotificationBell } from "./components/NotificationBell";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
  }`;

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-semibold text-slate-900">
            Kubera · ML Tracker
          </Link>
          <nav className="flex gap-1 items-center">
            <NavLink to="/" end className={navCls}>Dashboard</NavLink>
            <NavLink to="/productos" className={navCls}>Productos</NavLink>
            <NavLink to="/competidores" className={navCls}>Competidores</NavLink>
            <NavLink to="/objetivo" className={navCls}>Objetivo</NavLink>
            <NotificationBell />
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/productos" element={<Products />} />
          <Route path="/productos/:id" element={<ProductDetail />} />
          <Route path="/competidores" element={<Competidores />} />
          <Route path="/objetivo" element={<Goals />} />
        </Routes>
      </main>
    </div>
  );
}
