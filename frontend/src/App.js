import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';  // Import de la page de connexion
import DashboardEmploye from './pages/DashboardEmploye';  // Import du tableau de bord des employés
// import DashboardResponsable from './pages/DashboardResponsable';  Import du tableau de bord des responsables
import AdminPanel from './pages/AdminPanel';  // Import du panneau administrateur

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />  {/* Route de connexion par défaut */}
        <Route path="/employe" element={<DashboardEmploye />} />  {/* Tableau de bord employé */}
        {/*<Route path="/responsable" element={<DashboardResponsable />} />   Tableau de bord responsable */}
        <Route path="/admin" element={<AdminPanel />} />  {/* Panneau administrateur */}
      </Routes>
    </Router>
  );
}

export default App;
