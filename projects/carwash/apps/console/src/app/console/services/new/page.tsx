import { readSession } from "@/lib/session";
import { ServiceForm } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function NewServicePage() {
  const session = await readSession();
  return (
    <>
      <PageHeader title="Add a service" subtitle="A wash or an add-on customers can be quoted." />
      {session?.role !== "owner" ? (
        <Notice tone="warn">Only an owner can change the price list.</Notice>
      ) : (
        <Card>
          <div className="p-5">
            <ServiceForm />
          </div>
        </Card>
      )}
    </>
  );
}
