function createWebSocketService() {
  const clients = new Map();

  function setupWebSocket(server, WebSocketServer) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (userId) {
        clients.set(Number(userId), ws);
      }

      ws.on('close', () => {
        if (userId) {
          clients.delete(Number(userId));
        }
      });
    });

    return wss;
  }

  function sendToUser(userId, data) {
    const ws = clients.get(Number(userId));
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }

  function getConnectedUsers() {
    return Array.from(clients.keys());
  }

  return {
    setupWebSocket,
    sendToUser,
    broadcast,
    getConnectedUsers
  };
}

module.exports = {
  createWebSocketService
};
