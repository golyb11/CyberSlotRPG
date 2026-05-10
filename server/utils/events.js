function getRandomEvent() {
  const events = ['gold_rush', 'fury_fortune', 'mega_jackpot'];
  return events[Math.floor(Math.random() * events.length)];
}

function applyEvent(io, roomId, eventKey) {
  switch (eventKey) {
    case 'gold_rush':
      io.to(roomId).emit('event_start', {
        type: 'gold_rush',
        durationMs: 60_000,
        multiplier: 3
      });
      break;
    case 'fury_fortune':
      const sockets = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
      if (sockets.length > 0) {
        const luckyId = sockets[Math.floor(Math.random() * sockets.length)];
        io.to(luckyId).emit('event_fury_fortune');
      }
      break;
    case 'mega_jackpot':
      io.to(roomId).emit('event_jackpot_start', { pool: 0 });
      break;
  }
}

module.exports = { getRandomEvent, applyEvent };
