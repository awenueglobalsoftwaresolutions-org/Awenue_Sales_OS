import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import Gate from './components/layout/Gate'
import Spinner from './components/common/Spinner'
import Login from './pages/Auth/Login'
import ForgotPassword from './pages/Auth/ForgotPassword'
import ResetPassword from './pages/Auth/ResetPassword'

// Pages load on demand, so the first screen downloads less code.
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const OrganizationsPage = lazy(() => import('./pages/Organizations/OrganizationsPage'))
const OrganizationDetail = lazy(() => import('./pages/Organizations/OrganizationDetail'))
const ContactsPage = lazy(() => import('./pages/Contacts/ContactsPage'))
const ContactDetail = lazy(() => import('./pages/Contacts/ContactDetail'))
const LeadsPage = lazy(() => import('./pages/Leads/LeadsPage'))
const LeadDetail = lazy(() => import('./pages/Leads/LeadDetail'))
const WebsiteQueriesPage = lazy(() => import('./pages/WebsiteQueries/WebsiteQueriesPage'))
const DealsPage = lazy(() => import('./pages/Deals/DealsPage'))
const DealDetail = lazy(() => import('./pages/Deals/DealDetail'))
const PipelinePage = lazy(() => import('./pages/Pipeline/PipelinePage'))
const TasksPage = lazy(() => import('./pages/Tasks/TasksPage'))
const ActivitiesPage = lazy(() => import('./pages/Activities/ActivitiesPage'))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'))
const ReportsPage = lazy(() => import('./pages/Reports/ReportsPage'))
const InvoicesPage = lazy(() => import('./pages/Invoices/InvoicesPage'))
const InvoiceDetail = lazy(() => import('./pages/Invoices/InvoiceDetail'))
const ProjectsPage = lazy(() => import('./pages/Projects/ProjectsPage'))
const ProjectDetail = lazy(() => import('./pages/Projects/ProjectDetail'))
const TicketsPage = lazy(() => import('./pages/Tickets/TicketsPage'))
const NotificationsPage = lazy(() => import('./pages/Notifications/NotificationsPage'))

const guarded = (perm, el) => <Gate perm={perm}>{el}</Gate>

export default function App() {
  return (
    <Suspense fallback={<Spinner label="Loading" className="h-screen" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={guarded('dashboard.view', <Dashboard />)} />
            <Route path="organizations" element={guarded('organizations.view', <OrganizationsPage />)} />
            <Route path="organizations/:id" element={guarded('organizations.view', <OrganizationDetail />)} />
            <Route path="contacts" element={guarded('contacts.view', <ContactsPage />)} />
            <Route path="contacts/:id" element={guarded('contacts.view', <ContactDetail />)} />
            <Route path="leads" element={guarded('leads.view', <LeadsPage />)} />
            <Route path="leads/:id" element={guarded('leads.view', <LeadDetail />)} />
            <Route path="website-leads" element={<Navigate to="/leads" replace />} />
            <Route path="website-queries" element={guarded('leads.view', <WebsiteQueriesPage />)} />
            <Route path="deals" element={guarded('deals.view', <DealsPage />)} />
            <Route path="deals/:id" element={guarded('deals.view', <DealDetail />)} />
            <Route path="pipeline" element={guarded('deals.view', <PipelinePage />)} />
            <Route path="tasks" element={guarded('tasks.view', <TasksPage />)} />
            <Route path="activities" element={guarded('activities.view', <ActivitiesPage />)} />
            <Route path="reports" element={guarded('reports.view', <ReportsPage />)} />
            <Route path="invoices" element={guarded('invoices.view', <InvoicesPage />)} />
            <Route path="invoices/:id" element={guarded('invoices.view', <InvoiceDetail />)} />
            <Route path="projects" element={guarded('projects.view', <ProjectsPage />)} />
            <Route path="projects/:id" element={guarded('projects.view', <ProjectDetail />)} />
            <Route path="tickets" element={guarded('tickets.view', <TicketsPage />)} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
