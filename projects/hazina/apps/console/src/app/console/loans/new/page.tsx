import { api } from "@/lib/api";
import type { LoanProduct } from "@/lib/types";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ApplyForm } from "@/app/console/loans/new/form";

export default async function NewLoan({ searchParams }: { searchParams: Promise<{ memberNo?: string }> }) {
  const { memberNo } = await searchParams;
  const products = await api.get<LoanProduct[]>("/v1/loan-products");
  return (
    <>
      <PageHeader title="New loan application" subtitle="Taking the application is the first of four steps. Someone else must appraise it, someone else again decides it." />
      <div className="max-w-2xl">
        <Card>
          {products.length === 0 ? <EmptyState message="There is no loan product yet." detail="A manager or owner adds one under Loans, then Loan products." /> : <ApplyForm products={products} memberNo={memberNo ?? ""} />}
        </Card>
      </div>
    </>
  );
}
