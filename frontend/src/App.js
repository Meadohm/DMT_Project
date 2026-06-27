import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardEmploye from './pages/DashboardEmploye';
import DashboardResponsable from './pages/DashboardResponsable';
import AdminPanel from './pages/AdminPanel';
import SuperAdminPanel from './pages/SuperAdminPanel';

function RoleRedirect() {
  const role = localStorage.getItem('role');
  if (!role) return <Login />;
  if (role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'responsable') return <Navigate to="/dashboard-responsable" replace />;
  return <Navigate to="/dashboard" replace />;
}

function ProtectedRoute({ element, allowedRoles }) {
  const role = localStorage.getItem('role');
  if (!role) return <Navigate to="/" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to="/unauthorized" replace />;
  return element;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute
              element={<DashboardEmploye />}
              allowedRoles={['employe']}
            />
          }
        />
        <Route
          path="/dashboard-responsable"
          element={
            <ProtectedRoute
              element={<DashboardResponsable />}
              allowedRoles={['responsable']}
            />
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute
              element={<AdminPanel />}
              allowedRoles={['admin']}
            />
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute
              element={<SuperAdminPanel />}
              allowedRoles={['super_admin']}
            />
          }
        />
        <Route path="/unauthorized" element={<div>Accès non autorisé.</div>} />
      </Routes>
    </Router>
  );
}

export default App;