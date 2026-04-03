import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import PatientPage from './pages/PatientPage';
import DoctorPage from './pages/DoctorPage';
import PatientRecordPage from './pages/PatientRecordPage';

export default function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/patient" element={<ProtectedRoute><PatientPage /></ProtectedRoute>} />
          <Route path="/doctor" element={<ProtectedRoute><DoctorPage /></ProtectedRoute>} />
          <Route path="/records" element={<ProtectedRoute><PatientRecordPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={token ? '/patient' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
