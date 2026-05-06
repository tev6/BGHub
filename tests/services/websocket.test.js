const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createWebSocketService } = require('../../server/services/websocket');

describe('WebSocketService', () => {
  let webSocketService;

  beforeEach(() => {
    webSocketService = createWebSocketService();
  });

  describe('sendToUser', () => {
    it('should not throw when user is not connected', () => {
      assert.doesNotThrow(() => {
        webSocketService.sendToUser(999, { type: 'test' });
      });
    });
  });

  describe('broadcast', () => {
    it('should not throw when no users connected', () => {
      assert.doesNotThrow(() => {
        webSocketService.broadcast({ type: 'test' });
      });
    });
  });

  describe('getConnectedUsers', () => {
    it('should return empty array when no users connected', () => {
      const users = webSocketService.getConnectedUsers();
      assert.ok(Array.isArray(users));
      assert.strictEqual(users.length, 0);
    });
  });
});
