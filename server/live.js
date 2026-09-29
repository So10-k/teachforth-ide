export const focus = new Map();

export function createHub() {
  const rooms = new Map();
  const boards = new Map();
  return {
    subscribe(projectId, res) {
      if (!rooms.has(projectId)) rooms.set(projectId, new Set());
      rooms.get(projectId).add(res);
      res.on("close", () => rooms.get(projectId)?.delete(res));
    },
    publish(projectId, event, data) {
      const room = rooms.get(projectId);
      if (!room) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of room) {
        res.write(payload);
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
        for (const res of room) res.write(": ping\n\n");
      }
    },
  };
}
