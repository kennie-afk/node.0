import { profile } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="pb-12">
      <div className="wrap">
        <div className="rule" />
        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="mono text-[11px]" style={{ color: "var(--text-4)" }}>
            © {new Date().getFullYear()} {profile.name} · {profile.role}
          </p>
          <p className="mono text-[11px]" style={{ color: "var(--text-4)" }}>
            Built with Next.js · Every figure counted from source
          </p>
        </div>
      </div>
    </footer>
  );
}
