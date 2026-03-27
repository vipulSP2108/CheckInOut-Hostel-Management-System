import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Login from './components/Login.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import MemberDashboard from './components/MemberDashboard.jsx';
import { ThemeProvider } from './ThemeContext.jsx';

export default function App() {
  // We no longer store the raw JWT — the browser manages it as an HttpOnly cookie.
  // We only store role & identificationNumber in localStorage so React knows which dashboard to render.
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('role'));
  const [role, setRole] = useState(localStorage.getItem('role'));
  const [identificationNumber, setIdentificationNumber] = useState(localStorage.getItem('identificationNumber'));

  const handleLogin = ({ role, identificationNumber }) => {
    localStorage.setItem('role', role);
    if (identificationNumber) localStorage.setItem('identificationNumber', identificationNumber.toString());
    setRole(role);
    setIdentificationNumber(identificationNumber?.toString() ?? null);
    setLoggedIn(true);
  };

  const handleLogout = async () => {
    // Ask server to clear the HttpOnly cookie
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('role');
    localStorage.removeItem('identificationNumber');
    setLoggedIn(false);
    setRole(null);
    setIdentificationNumber(null);
  };

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={
            !loggedIn ? <Login onLogin={handleLogin} /> :
            <Navigate to={role === 'Admin' ? '/admin' : `/member/${identificationNumber}`} />
          } />
          <Route path="/admin" element={
            loggedIn && role === 'Admin' ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/login" />
          } />
          <Route path="/member/:id" element={
            loggedIn && role === 'Regular' ? <MemberDashboard storedIdentificationNumber={identificationNumber} onLogout={handleLogout} /> : <Navigate to="/login" />
          } />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
