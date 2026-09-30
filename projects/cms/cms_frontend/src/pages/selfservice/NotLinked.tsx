import { EmptyState } from '../../ui';

export function NotLinked() {
  return <EmptyState title="Your sign-in is not linked to a member record yet" message="The church office needs to link your login to your membership before these pages can show your details. Please ask them; it only takes a moment." />;
}
