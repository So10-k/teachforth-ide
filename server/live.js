export const focus = new Map();

export function preferBoard(live, stored) {
  const saved = stored || { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
  if (!live) return saved;
  const count = (doc) => (doc.slides || []).reduce((sum, slide) => sum + (slide.strokes?.length || 0), 0);
  if (!count(live) && count(saved)) return saved;
  return live;
}

function keepViewer(room, res) {
  if (!res._tfCan) return true;
  try {
    if (res._tfCan()) return true;
  } catch {
    // A viewer whose access can no longer be checked is dropped.
  }
  room.delete(res);
  try { res.end(); } catch { /* already closed */ }
  return false;
}

export function createHub() {
  const rooms = new Map();
  const boards = new Map();
  return {
    subscribe(projectId, res, viewer) {
      if (!rooms.has(projectId)) rooms.set(projectId, new Set());
      rooms.get(projectId).add(res);
      if (viewer) {
        res._tfViewer = viewer.user;
        res._tfCan = viewer.can;
      }
      res.on("close", () => rooms.get(projectId)?.delete(res));
    },
    publish(projectId, event, data, shape) {
      const room = rooms.get(projectId);
      if (!room) return;
      for (const res of [...room]) {
        if (!keepViewer(room, res)) continue;
        const payload = shape ? shape(res._tfViewer, data) : data;
        if (!payload) continue;
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        } catch {
          room.delete(res);
        }
      }
    },
    rememberBoard(projectId, doc) {
      boards.set(projectId, doc);
    },
    board(projectId) {
      return boards.get(projectId) || null;
    },
    openCount() {
      let n = 0;
      for (const room of rooms.values()) n += room.size;
      return n;
    },
    ping() {
      for (const room of rooms.values()) {
        for (const res of [...room]) {
          if (!keepViewer(room, res)) continue;
          try {
            res.write(": ping\n\n");
          } catch {
            room.delete(res);
          }
        }
      }
    },
  };
}
