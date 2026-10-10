// Messages for the taskbar: direct messages from the admin / a parent, plus announcements.
// The list is fetched from the server and cached on disk so it can still be read offline.
// "Read" marks are kept on this PC.
function createInbox({ store, request, isOnline, emit }) {
  const FILE = "inbox.json";
  let state = store.read(FILE, { messages: [], read: [] });
  if (!Array.isArray(state.messages)) state = { messages: [], read: [] };
  let firstLoad = state.messages.length === 0;

  const save = () => store.write(FILE, { messages: state.messages, read: state.read.slice(-300) });
  const readSet = () => new Set(state.read);
  const view = () => {
    const read = readSet();
    const messages = state.messages.map((m) => ({ ...m, read: read.has(m.id) }));
    return { messages, unread: messages.filter((m) => !m.read).length };
  };

  async function refresh() {
    if (!isOnline()) return view();
    try {
      const res = await request("/api/offline/inbox", { method: "GET" });
      if (!res || !Array.isArray(res.messages)) return view();
      const known = new Set(state.messages.map((m) => m.id));
      const fresh = res.messages.filter((m) => !known.has(m.id));
      state.messages = res.messages;
      if (firstLoad) {
        // First ever download: don't flood the student with alerts for old messages.
        state.read = [...new Set([...state.read, ...res.messages.filter((m) => Date.now() - m.at > 86400_000).map((m) => m.id)])];
        firstLoad = false;
      }
      save();
      const freshUnread = fresh.filter((m) => !readSet().has(m.id));
      emit({ type: "inbox", unread: view().unread, fresh: freshUnread });
    } catch {
      /* offline: keep the cache */
    }
    return view();
  }

  return {
    list: view,
    refresh,
    markRead(ids) {
      const set = readSet();
      for (const id of Array.isArray(ids) ? ids : []) set.add(String(id));
      state.read = [...set];
      save();
      emit({ type: "inbox", unread: view().unread, fresh: [] });
      return view();
    },
  };
}

module.exports = { createInbox };
