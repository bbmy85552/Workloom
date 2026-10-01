import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { AdminShell } from '../components/shell/AdminShell';
import { SetupGate } from '../components/SetupGate';
import { RequireAuth, RequireAdmin, RequireGuest } from '../components/Guard';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { SetupPage } from '../pages/setup/SetupPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { DocsListPage } from '../pages/docs/DocsListPage';
import { DocDetailPage } from '../pages/docs/DocDetailPage';
import { TablesListPage } from '../pages/tables/TablesListPage';
import { TableDetailPage } from '../pages/tables/TableDetailPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { MailPage } from '../pages/mail/MailPage';
import { OaPage } from '../pages/oa/OaPage';
import { RecentPage } from '../pages/recent/RecentPage';
import { ProfilePage } from '../pages/settings/ProfilePage';
import { SecurityPage } from '../pages/settings/SecurityPage';
import { CliPage } from '../pages/settings/CliPage';
import { FontsPage } from '../pages/settings/FontsPage';
import { PreferencesPage } from '../pages/settings/PreferencesPage';
import { PublicFormPage } from '../pages/forms/PublicFormPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminAuditPage } from '../pages/admin/AdminAuditPage';
import { AdminGroupsPage } from '../pages/admin/AdminGroupsPage';
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage';
import { AdminTrashPage } from '../pages/admin/AdminTrashPage';
import { SharePage } from '../pages/share/SharePage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <SetupGate />,
    children: [
      {
        path: '/',
        element: <Navigate to="/app/dashboard" replace />,
      },
      { path: '/setup', element: <SetupPage /> },
      {
        element: <RequireGuest />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        path: '/app',
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'docs', element: <DocsListPage /> },
          { path: 'docs/:id', element: <DocDetailPage /> },
          { path: 'tables', element: <TablesListPage /> },
          { path: 'tables/:id', element: <TableDetailPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'mail', element: <MailPage /> },
          { path: 'recent', element: <RecentPage /> },
          { path: 'oa', element: <OaPage /> },
          { path: 'settings', element: <Navigate to="/app/settings/profile" replace /> },
          { path: 'settings/profile', element: <ProfilePage /> },
          { path: 'settings/security', element: <SecurityPage /> },
          { path: 'settings/cli', element: <CliPage /> },
          { path: 'settings/preferences', element: <PreferencesPage /> },
          { path: 'settings/fonts', element: <FontsPage /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <Navigate to="/admin/users" replace /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'groups', element: <AdminGroupsPage /> },
          { path: 'settings', element: <AdminSettingsPage /> },
          { path: 'trash', element: <AdminTrashPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
        ],
      },
      { path: '/share/:token', element: <SharePage /> },
      { path: '/forms/:token', element: <PublicFormPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
