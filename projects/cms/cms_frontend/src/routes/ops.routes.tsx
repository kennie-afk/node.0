import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { lazyPage } from './lazy';

/** Operations-side routes (volunteers, check-in, facilities, visitors, care, comms, self-service, data & privacy). */
const page = (key: string, path: string, loader: Parameters<typeof lazyPage>[0], permission?: Parameters<typeof lazyPage>[1]): ReactElement => (
  <Route key={key} path={path} element={lazyPage(loader, permission)} />
);

const READ = 'members:read' as const;
const WRITE = 'members:write' as const;

export const opsRoutes: ReactElement[] = [
  page('ops-overview', '/operations', () => import('../pages/ops/OperationsOverviewPage'), READ),

  // Communications
  <Route key="comms-index" path="/comms" element={<Navigate to="/comms/campaigns" replace />} />,
  page('comms-campaigns', '/comms/campaigns', () => import('../pages/comms/CampaignsPage'), 'comms:send'),
  page('comms-campaign-new', '/comms/campaigns/new', () => import('../pages/comms/CampaignFormPage'), 'comms:send'),
  page('comms-campaign', '/comms/campaigns/:id', () => import('../pages/comms/CampaignDetailPage'), 'comms:send'),
  page('comms-templates', '/comms/templates', () => import('../pages/comms/TemplatesPage'), 'comms:send'),
  page('comms-template-new', '/comms/templates/new', () => import('../pages/comms/TemplateFormPage'), 'comms:send'),
  page('comms-template-edit', '/comms/templates/:id/edit', () => import('../pages/comms/TemplateFormPage'), 'comms:send'),
  page('comms-segments', '/comms/segments', () => import('../pages/comms/SegmentsPage'), 'comms:send'),
  page('comms-segment-new', '/comms/segments/new', () => import('../pages/comms/SegmentFormPage'), 'comms:send'),
  page('comms-segment-edit', '/comms/segments/:id/edit', () => import('../pages/comms/SegmentFormPage'), 'comms:send'),
  page('comms-outbox', '/comms/outbox', () => import('../pages/comms/OutboxPage'), 'comms:send'),

  // Volunteers
  <Route key="vol-index" path="/volunteers" element={<Navigate to="/volunteers/teams" replace />} />,
  page('vol-teams', '/volunteers/teams', () => import('../pages/volunteers/TeamsPage'), READ),
  page('vol-team-new', '/volunteers/teams/new', () => import('../pages/volunteers/TeamFormPage'), WRITE),
  page('vol-team', '/volunteers/teams/:id', () => import('../pages/volunteers/TeamDetailPage'), READ),
  page('vol-rosters', '/volunteers/rosters', () => import('../pages/volunteers/RostersPage'), READ),
  page('vol-roster-new', '/volunteers/rosters/new', () => import('../pages/volunteers/RosterFormPage'), WRITE),
  page('vol-swaps', '/volunteers/swaps', () => import('../pages/volunteers/SwapsPage'), READ),
  page('vol-availability', '/volunteers/availability', () => import('../pages/volunteers/AvailabilityPage')),
  page('vol-reminders', '/volunteers/reminders', () => import('../pages/volunteers/RemindersPage'), READ),

  // Children's check-in
  page('checkin-station', '/checkin', () => import('../pages/checkin/StationPage'), READ),
  page('checkin-label', '/checkin/label', () => import('../pages/checkin/LabelPage'), WRITE),
  page('checkin-checkout', '/checkin/sessions/:id/checkout', () => import('../pages/checkin/CheckoutPage'), WRITE),
  page('checkin-children', '/checkin/children', () => import('../pages/checkin/ChildrenPage'), READ),
  page('checkin-child-new', '/checkin/children/new', () => import('../pages/checkin/ChildFormPage'), WRITE),
  page('checkin-child', '/checkin/children/:id', () => import('../pages/checkin/ChildDetailPage'), READ),
  page('checkin-child-edit', '/checkin/children/:id/edit', () => import('../pages/checkin/ChildEditPage'), WRITE),
  page('checkin-guardian-new', '/checkin/children/:id/guardians/new', () => import('../pages/checkin/GuardianFormPage'), WRITE),
  page('checkin-guardian-edit', '/checkin/guardians/:gid/edit', () => import('../pages/checkin/GuardianFormPage'), WRITE),
  page('checkin-rooms', '/checkin/rooms', () => import('../pages/checkin/RoomsPage'), READ),
  page('checkin-room-new', '/checkin/rooms/new', () => import('../pages/checkin/RoomFormPage'), WRITE),
  page('checkin-room-edit', '/checkin/rooms/:id/edit', () => import('../pages/checkin/RoomFormPage'), WRITE),
  page('checkin-history', '/checkin/history', () => import('../pages/checkin/SessionsPage'), READ),
  page('checkin-security', '/checkin/security', () => import('../pages/checkin/SecurityTrailPage'), WRITE),

  // Facilities
  <Route key="fac-index" path="/facilities" element={<Navigate to="/facilities/bookings" replace />} />,
  page('fac-bookings', '/facilities/bookings', () => import('../pages/facilities/BookingsPage'), READ),
  page('fac-booking-new', '/facilities/bookings/new', () => import('../pages/facilities/BookingFormPage'), WRITE),
  page('fac-booking', '/facilities/bookings/:id', () => import('../pages/facilities/BookingDetailPage'), READ),
  page('fac-resources', '/facilities/resources', () => import('../pages/facilities/ResourcesPage'), READ),
  page('fac-resource-new', '/facilities/resources/new', () => import('../pages/facilities/ResourceFormPage'), WRITE),
  page('fac-resource-edit', '/facilities/resources/:id/edit', () => import('../pages/facilities/ResourceFormPage'), WRITE),

  // Visitors
  page('vis-pipeline', '/visitors', () => import('../pages/visitors/PipelinePage'), READ),
  page('vis-list', '/visitors/list', () => import('../pages/visitors/VisitorsListPage'), READ),
  page('vis-tasks', '/visitors/tasks', () => import('../pages/visitors/VisitorTasksPage'), READ),
  page('vis-new', '/visitors/new', () => import('../pages/visitors/VisitorFormPage'), WRITE),
  page('vis-detail', '/visitors/:id', () => import('../pages/visitors/VisitorDetailPage'), READ),
  page('vis-edit', '/visitors/:id/edit', () => import('../pages/visitors/VisitorFormPage'), WRITE),
  page('vis-interaction', '/visitors/:id/interactions/new', () => import('../pages/visitors/VisitorInteractionFormPage'), WRITE),
  page('vis-task-new', '/visitors/:id/tasks/new', () => import('../pages/visitors/VisitorTaskFormPage'), WRITE),
  page('vis-convert', '/visitors/:id/convert', () => import('../pages/visitors/VisitorConvertPage'), WRITE),

  // Pastoral care
  page('care-home', '/care', () => import('../pages/care/CareHomePage'), 'care:read'),
  page('care-member', '/care/members/:memberId', () => import('../pages/care/CareMemberPage'), 'care:read'),
  page('care-note-new', '/care/notes/new', () => import('../pages/care/NoteFormPage'), 'care:write'),
  page('care-note', '/care/notes/:id', () => import('../pages/care/NoteDetailPage'), 'care:read'),
  page('care-note-edit', '/care/notes/:id/edit', () => import('../pages/care/NoteFormPage'), 'care:write'),
  page('care-visit-new', '/care/visitations/new', () => import('../pages/care/VisitationFormPage'), 'care:write'),
  page('care-prayer', '/care/prayer-requests', () => import('../pages/care/PrayerRequestsPage'), 'care:read'),
  page('care-prayer-new', '/care/prayer-requests/new', () => import('../pages/care/PrayerRequestFormPage'), 'care:write'),
  page('care-prayer-update', '/care/prayer-requests/:id/update', () => import('../pages/care/PrayerRequestUpdatePage'), 'care:write'),

  // Member self-service (any signed-in user; the server decides what a link allows)
  page('me-home', '/me', () => import('../pages/selfservice/MePage')),
  page('me-profile', '/me/profile', () => import('../pages/selfservice/MeProfilePage')),
  page('me-family', '/me/family', () => import('../pages/selfservice/MeFamilyPage')),
  page('me-groups', '/me/groups', () => import('../pages/selfservice/MeGroupsPage')),
  page('me-giving', '/me/giving', () => import('../pages/selfservice/MeGivingPage')),
  page('me-prayer', '/me/prayer', () => import('../pages/selfservice/MePrayerPage')),
  page('me-availability', '/me/availability', () => import('../pages/volunteers/AvailabilityPage')),
  page('me-privacy', '/me/privacy', () => import('../pages/selfservice/MePrivacyPage')),
  page('account-links', '/account-links', () => import('../pages/selfservice/AccountLinksPage'), 'users:manage'),
  page('account-link-new', '/account-links/new', () => import('../pages/selfservice/AccountLinkFormPage'), 'users:manage'),

  // Data & privacy
  <Route key="data-index" path="/data" element={<Navigate to="/data/exports" replace />} />,
  page('data-import', '/data/import', () => import('../pages/dataops/ImportPage'), WRITE),
  page('data-imports', '/data/imports', () => import('../pages/dataops/ImportHistoryPage'), WRITE),
  page('data-exports', '/data/exports', () => import('../pages/dataops/ExportsPage'), READ),
  page('data-consents', '/data/consents', () => import('../pages/dataops/ConsentsPage'), READ),
  page('data-consent-new', '/data/consents/:memberId/new', () => import('../pages/dataops/ConsentRecordPage'), WRITE),
  page('data-access', '/data/subject-access', () => import('../pages/dataops/SubjectAccessPage'), 'users:manage'),
  page('data-erasure', '/data/erasure', () => import('../pages/dataops/ErasurePage'), 'users:manage'),
  page('data-erasure-new', '/data/erasure/new', () => import('../pages/dataops/ErasureNewPage'), 'users:manage'),
  page('data-erasure-refuse', '/data/erasure/:id/refuse', () => import('../pages/dataops/ErasureRefusePage'), 'users:manage')
];
