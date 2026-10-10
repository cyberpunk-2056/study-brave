import { addChannelById, removeChannelByYtId } from "@/app/actions/study";
import { addGlobalChannelById } from "@/app/actions/admin";
import { Icon } from "./Icon";

/** "Subscribe"-style button: adds or removes a channel from the student's study list. */
export function ChannelButton({ ytId, added, global = false }: { ytId: string; added: boolean; global?: boolean }) {
  if (added && global) return <span className="badge bg-ok-bg !px-4 !py-2 text-ok-fg">Approved ✓</span>;
  return (
    <form action={added ? removeChannelByYtId : global ? addGlobalChannelById : addChannelById}>
      <input type="hidden" name="ytId" value={ytId} />
      {added ? (
        <button className="btn-ghost !rounded-full" title="Remove from my study channels">
          <Icon name="check" className="h-4 w-4" /> Added
        </button>
      ) : (
        <button className="btn !rounded-full">
          <Icon name="plus" className="h-4 w-4" /> {global ? "Approve for all" : "Add to study"}
        </button>
      )}
    </form>
  );
}
