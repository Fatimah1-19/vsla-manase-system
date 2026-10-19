import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Savings from './pages/Savings.jsx';
import Loans from './pages/Loans.jsx';
import Members from './pages/Members.jsx';
import AdministrativeRecords from './pages/AdministrativeRecords.jsx';
import Meetings from './pages/Meetings.jsx';
import Welfare from './pages/Welfare.jsx';
import Fines from './pages/Fines.jsx';
import ShareOut from './pages/ShareOut.jsx';
import JoinRequests from './pages/JoinRequests.jsx';
import Cases from './pages/Cases.jsx';
import Leadership from './pages/Leadership.jsx';
import Messages from './pages/Messages.jsx';
import Cycles from './pages/Cycles.jsx';
import Activity from './pages/Activity.jsx';
import AdministrativeActivity from './pages/AdministrativeActivity.jsx';
import Profile from './pages/Profile.jsx';
import Analytics from './pages/Analytics.jsx';
import Wrappers from './pages/Wrappers.jsx';
import Approvals from './pages/Approvals.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import SystemSettings from './pages/SystemSettings.jsx';
import VslaSettings from './pages/VslaSettings.jsx';
import AdminRoles from './pages/AdminRoles.jsx';
import SystemActivity from './pages/SystemActivity.jsx';
import NotFound from './pages/NotFound.jsx';
import './styles.css';

const COMMITTEE = ['admin', 'treasurer', 'secretary'];
const EVERYONE = ['admin', 'treasurer', 'secretary', 'member'];
// The administrator is not part of the group's book-keeping, so she is kept out
// of every money page. She can still look at join requests.
const EVERYONE_AND_ADMIN = [...EVERYONE, 'system_admin'];

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Everything behind a log-in */}
      <Route
        path="/app"
        element={<ProtectedRoute><Layout /></ProtectedRoute>}
      >
        <Route index element={<Dashboard />} />
        <Route path="savings"  element={<ProtectedRoute roles={COMMITTEE}><Savings /></ProtectedRoute>} />
        <Route path="analytics" element={<ProtectedRoute roles={COMMITTEE}><Analytics /></ProtectedRoute>} />
        <Route path="reports"   element={<Navigate to="/app/analytics?tab=reports" replace />} />
        <Route path="wrappers" element={<ProtectedRoute roles={EVERYONE}><Wrappers /></ProtectedRoute>} />
        <Route path="loans"    element={<ProtectedRoute roles={EVERYONE}><Loans /></ProtectedRoute>} />
        <Route path="members"  element={<ProtectedRoute roles={COMMITTEE}><Members /></ProtectedRoute>} />
        <Route path="records"  element={<ProtectedRoute roles={COMMITTEE}><AdministrativeRecords /></ProtectedRoute>} />
        <Route path="meetings" element={<ProtectedRoute roles={EVERYONE}><Meetings /></ProtectedRoute>} />
        <Route path="welfare"  element={<ProtectedRoute roles={EVERYONE}><Welfare /></ProtectedRoute>} />
        <Route path="fines"    element={<ProtectedRoute roles={EVERYONE}><Fines /></ProtectedRoute>} />
        <Route path="shareout" element={<ProtectedRoute roles={EVERYONE}><ShareOut /></ProtectedRoute>} />
        {/* An administrator who is also a member keeps the member's say in the
            group's votes; the money pages above stay closed to her. */}
        <Route path="requests" element={<ProtectedRoute roles={EVERYONE_AND_ADMIN}><JoinRequests /></ProtectedRoute>} />
        <Route path="cases"    element={<ProtectedRoute roles={EVERYONE_AND_ADMIN}><Cases /></ProtectedRoute>} />
        <Route path="leadership" element={<ProtectedRoute roles={EVERYONE_AND_ADMIN}><Leadership /></ProtectedRoute>} />
        <Route path="messages" element={<ProtectedRoute roles={COMMITTEE}><Messages /></ProtectedRoute>} />
        <Route path="cycles"   element={<ProtectedRoute roles={['admin']}><Cycles /></ProtectedRoute>} />
        <Route path="activity" element={<ProtectedRoute roles={[...COMMITTEE, 'system_admin']}><Activity /></ProtectedRoute>} />
        <Route path="activity/administrative" element={<ProtectedRoute roles={COMMITTEE}><AdministrativeActivity /></ProtectedRoute>} />
        <Route path="approvals" element={<ProtectedRoute roles={['admin', 'treasurer']}><Approvals /></ProtectedRoute>} />
        <Route path="admin/users" element={<ProtectedRoute roles={['system_admin']}><AdminUsers /></ProtectedRoute>} />
        <Route path="admin/roles" element={<ProtectedRoute roles={['system_admin']}><AdminRoles /></ProtectedRoute>} />
        <Route path="admin/settings" element={<Navigate to="/app/admin/settings/general" replace />} />
        <Route path="admin/settings/:section" element={<ProtectedRoute roles={['system_admin']}><VslaSettings /></ProtectedRoute>} />
        <Route path="admin/system" element={<ProtectedRoute roles={['system_admin']}><SystemSettings /></ProtectedRoute>} />
        <Route path="admin/activity" element={<ProtectedRoute roles={['system_admin']}><SystemActivity /></ProtectedRoute>} />
        <Route path="profile"  element={<ProtectedRoute roles={EVERYONE_AND_ADMIN}><Profile /></ProtectedRoute>} />
      </Route>

      {/* Old links from the HTML version */}
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="/index.html" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
