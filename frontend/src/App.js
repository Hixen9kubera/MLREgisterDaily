import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Goals from "./pages/Goals";
const navCls = ({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"}`;
export default function App() {
    return (_jsxs("div", { className: "min-h-screen", children: [_jsx("header", { className: "bg-white border-b border-slate-200", children: _jsxs("div", { className: "max-w-7xl mx-auto px-6 h-14 flex items-center justify-between", children: [_jsx(Link, { to: "/", className: "font-semibold text-slate-900", children: "Kubera \u00B7 ML Tracker" }), _jsxs("nav", { className: "flex gap-1", children: [_jsx(NavLink, { to: "/", end: true, className: navCls, children: "Dashboard" }), _jsx(NavLink, { to: "/productos", className: navCls, children: "Productos" }), _jsx(NavLink, { to: "/objetivo", className: navCls, children: "Objetivo" })] })] }) }), _jsx("main", { className: "max-w-7xl mx-auto px-6 py-6", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/productos", element: _jsx(Products, {}) }), _jsx(Route, { path: "/productos/:id", element: _jsx(ProductDetail, {}) }), _jsx(Route, { path: "/objetivo", element: _jsx(Goals, {}) })] }) })] }));
}
