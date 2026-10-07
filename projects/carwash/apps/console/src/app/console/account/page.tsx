import { readSession } from "@/lib/session";
import { ChangePinForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export default async function AccountPage() {
  const session = await readSession();
  return (
    <>
      <PageHeader
        title="My account"
        subtitle={`Signed in as ${session?.displayName ?? "you"}, ${session?.role ?? ""}. Change your PIN here; if you ever forget it, a manager or the owner can reset it.`}
      />
      <Card title="Change my PIN" description="Changing it signs out every other phone or browser that is signed in as you.">
        <ChangePinForm />
      </Card>
    </>
  );
}
