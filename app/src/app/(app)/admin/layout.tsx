import { requireAdmin } from "@/lib/session";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Admin panel</h1>
        <p className="text-muted">Manage students, channels and announcements.</p>
      </div>
      <AdminTabs />
      {children}
    </div>
  );
}
