import { FilesGallery } from "@/components/FilesGallery";
import { requireUser } from "@/lib/session";

export default async function Files() {
  await requireUser();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="page-title">My Files</h1>
        <p className="text-muted">Screenshots you&apos;ve taken, right here in the app.</p>
      </div>
      <FilesGallery />
    </div>
  );
}
