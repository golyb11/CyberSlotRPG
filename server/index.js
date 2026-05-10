const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const fs = require('fs');

const DATA_PATH = path.join(__dirname, 'data', 'users.json');

function loadUsers() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
  } catch (e) { console.error('Error loading users:', e); }
  return {};
}

function saveUsers(db) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
  } catch (e) { console.error('Error saving users:', e); }
}

const { spinReels, evaluateSpin } = require('./utils/slot');
const { getRandomEvent, applyEvent } = require('./utils/events');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const db = loadUsers(); // Persistent DB by nickname
const rooms = {}; // {roomId: {players: Set<socket.id>, timer: Timeout}}
const users = {}; // {socket.id: {nickname, avatar, balance, upgrades, roomId}}

const MAX_PLAYERS_PER_ROOM = 6;
const GLOBAL_EVENT_MIN_MS = 10 * 60 * 1000;
const GLOBAL_EVENT_MAX_MS = 15 * 60 * 1000;

function assignRoom(socket) {
  for (const [roomId, data] of Object.entries(rooms)) {
    if (data.players.size < MAX_PLAYERS_PER_ROOM) {
      socket.join(roomId);
      data.players.add(socket.id);
      return roomId;
    }
  }
  const newRoomId = `room-${crypto.randomBytes(3).toString('hex')}`;
  rooms[newRoomId] = {
    players: new Set([socket.id]),
    timer: scheduleGlobalEvent(newRoomId)
  };
  socket.join(newRoomId);
  return newRoomId;
}

function scheduleGlobalEvent(roomId) {
  const delay = GLOBAL_EVENT_MIN_MS + Math.random() * (GLOBAL_EVENT_MAX_MS - GLOBAL_EVENT_MIN_MS);
  return setTimeout(() => {
    const ev = getRandomEvent();
    applyEvent(io, roomId, ev);
    rooms[roomId].timer = scheduleGlobalEvent(roomId);
  }, delay);
}

io.on('connection', (socket) => {
  console.log(`🔌 ${socket.id} connected`);

  socket.on('join', ({ nickname, avatar }) => {
    const roomId = assignRoom(socket);
    const nick = nickname || 'Anon';
    
    // Load from DB or create new
    if (!db[nick]) {
      db[nick] = {
        nickname: nick,
        avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${nick}`,
        balance: 1000,
        upgrades: {
          auraLuck: 0,
          chipMagnet: false,
          hackerModuleCooldown: 0,
          vip: false
        }
      };
      saveUsers(db);
    }

    users[socket.id] = { ...db[nick], roomId };

    io.to(roomId).emit('room_state', {
      players: Array.from(rooms[roomId].players).map(id => ({
        id,
        nickname: users[id].nickname,
        avatar: users[id].avatar,
        balance: users[id].balance,
        upgrades: users[id].upgrades
      }))
    });
  });

  socket.on('spin', ({ bet }) => {
    const user = users[socket.id];
    if (!user) return;
    if (bet > user.balance) return socket.emit('error_msg', 'Insufficient balance');

    user.balance -= bet;
    db[user.nickname].balance = user.balance; // Sync to DB

    const wildBoost = Math.min(user.upgrades.auraLuck * 0.2, 2);
    const spinResult = spinReels(wildBoost);
    const winInfo = evaluateSpin(spinResult, bet);

    if (winInfo.payout > 0) {
      user.balance += winInfo.payout;
      db[user.nickname].balance = user.balance; // Sync to DB
    }
    
    saveUsers(db);

    io.to(user.roomId).emit('spin_result', {
      playerId: socket.id,
      bet,
      spinResult,
      winInfo,
      balances: Array.from(rooms[user.roomId].players).reduce((acc, id) => {
        acc[id] = users[id].balance;
        return acc;
      }, {})
    });

    if (user.upgrades.chipMagnet) {
      const magnetGain = Math.floor(0.01 * winInfo.payout);
      if (magnetGain > 0) {
        user.balance += magnetGain;
        socket.emit('magnet_gain', magnetGain);
      }
    }
  });

  socket.on('buy_upgrade', ({ upgradeKey, cost }) => {
    const user = users[socket.id];
    if (!user || user.balance < cost) return;
    user.balance -= cost;

    switch (upgradeKey) {
      case 'auraLuck':
        user.upgrades.auraLuck = Math.min(user.upgrades.auraLuck + 1, 10);
        break;
      case 'chipMagnet':
        user.upgrades.chipMagnet = true;
        break;
      case 'hackerModule':
        user.upgrades.hackerModuleCooldown = Date.now() + 30 * 60 * 1000;
        break;
      case 'vip':
        user.upgrades.vip = true;
        break;
    }

    db[user.nickname].balance = user.balance;
    db[user.nickname].upgrades = user.upgrades;
    saveUsers(db);

    io.to(user.roomId).emit('room_state', {
      players: Array.from(rooms[user.roomId].players).map(id => ({
        id,
        nickname: users[id].nickname,
        avatar: users[id].avatar,
        balance: users[id].balance,
        upgrades: users[id].upgrades
      }))
    });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (!user) return;
    const room = rooms[user.roomId];
    if (room) {
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        clearTimeout(room.timer);
        delete rooms[user.roomId];
      } else {
        io.to(user.roomId).emit('room_state', {
          players: Array.from(room.players).map(id => ({
            id,
            nickname: users[id].nickname,
            avatar: users[id].avatar,
            balance: users[id].balance,
            upgrades: users[id].upgrades
          }))
        });
      }
    }
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
