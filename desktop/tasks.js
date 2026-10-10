// To-do list for the taskbar. The app keeps its own copy (so it works with no internet) and a list of the changes
// made since the last sync (add / toggle / delete). When online, the changes are replayed on the server, which
// answers with the full list. New tasks get a temporary local id until the server gives them a real one.
const crypto = require("node:crypto");

function applyOps(items, ops) {
  let list = items.map((t) => ({ ...t }));
  for (const op of ops) {
    if (op.op === "add") list.unshift({ id: op.localId, title: op.title, done: 0 });
    else if (op.op === "toggle") list = list.map((t) => (t.id === op.id ? { ...t, done: t.done ? 0 : 1 } : t));
    else if (op.op === "delete") list = list.filter((t) => t.id !== op.id);
  }
  return list.sort((a, b) => a.done - b.done);
}

function createTasks({ store, request, isOnline, emit }) {
  const FILE = "tasks.json";
  let state = store.read(FILE, { items: [], ops: [], syncedAt: 0 });
  if (!Array.isArray(state.items)) state = { items: [], ops: [], syncedAt: 0 };
  let syncing = false;

  const save = () => store.write(FILE, state);
  const view = () => ({ items: applyOps(state.items, state.ops).slice(0, 100), pending: state.ops.length, syncedAt: state.syncedAt });

  async function sync() {
    if (syncing || !isOnline()) return;
    syncing = true;
    const sent = state.ops.slice();
    try {
      const res = await request("/api/offline/tasks", { method: "POST", body: { ops: sent } });
      if (!res || !Array.isArray(res.tasks)) return;
      // Changes made while the request was in flight stay queued and are re-applied on top of the fresh list.
      const map = res.idMap || {};
      const remaining = state.ops.slice(sent.length).map((o) => ({ ...o, id: o.id && map[o.id] ? map[o.id] : o.id }));
      state = { items: res.tasks, ops: remaining, syncedAt: Date.now() };
      save();
      emit({ type: "tasks" });
    } catch {
      /* offline or server down: the queued changes are kept */
    } finally {
      syncing = false;
    }
  }

  const push = (op) => {
    state.ops.push(op);
    save();
    emit({ type: "tasks" });
    void sync();
  };

  return {
    list: view,
    sync,
    add(title) {
      const clean = String(title || "").trim().slice(0, 120);
      if (!clean) return view();
      push({ op: "add", localId: "l-" + crypto.randomUUID(), title: clean });
      return view();
    },
    toggle(id) {
      if (applyOps(state.items, state.ops).some((t) => t.id === id)) push({ op: "toggle", id: String(id) });
      return view();
    },
    remove(id) {
      if (applyOps(state.items, state.ops).some((t) => t.id === id)) push({ op: "delete", id: String(id) });
      return view();
    },
  };
}

module.exports = { createTasks, applyOps };
