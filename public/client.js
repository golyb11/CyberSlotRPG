const socket = io();
let myId = null;
let currentBalance = 0;
let isSpinning = false;

const SYMBOL_EMOJIS = {
  CHERRY: '🍒', LEMON: '🍋', WATERMELON: '🍉',
  GOLD_BAR: '💰', CROWN: '👑', WILD: '🃏', SCATTER: '⭐'
};

const reelsContainer = document.getElementById('slotMachine');
const paylinesOverlay = document.getElementById('paylinesOverlay');
const spinBtn = document.getElementById('spinBtn');
const balanceEl = document.getElementById('myBalance');
const playersList = document.getElementById('players');
const winLog = document.getElementById('winLog');
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

function initReels() {
  reelsContainer.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const reel = document.createElement('div');
    reel.className = 'reel';
    reel.id = `reel-${i}`;
    for (let j = 0; j < 12; j++) {
      const sym = document.createElement('div');
      sym.className = 'symbol';
      sym.textContent = Object.values(SYMBOL_EMOJIS)[Math.floor(Math.random() * 6)];
      reel.appendChild(sym);
    }
    reelsContainer.appendChild(reel);
  }
}
initReels();

document.getElementById('joinBtn').onclick = () => {
  const nick = document.getElementById('nickname').value || 'Игрок';
  const avatar = document.getElementById('avatarUrl').value || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${nick}`;
  socket.emit('join', { nickname: nick, avatar });
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
};

function attachUpgradeListeners() {
  document.querySelectorAll('.upgrade').forEach(btn => {
    btn.onclick = () => {
      const upgradeKey = btn.dataset.key;
      const cost = parseInt(btn.dataset.cost);
      socket.emit('buy_upgrade', { upgradeKey, cost });
    };
  });
}

socket.on('room_state', ({ players }) => {
  myId = socket.id;
  playersList.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <img src="${p.avatar}" class="player-avatar" alt="avatar">
      <div class="player-info">
        <span class="player-name">${p.nickname}</span>
        <span class="player-balance">${p.balance} CREDITS</span>
      </div>
    `;
    playersList.appendChild(card);
    if (p.id === myId) {
      currentBalance = p.balance;
      balanceEl.textContent = currentBalance;
    }
  });
  // Re-attach upgrade listeners after DOM update
  attachUpgradeListeners();
});

socket.on('spin_result', ({ playerId, spinResult, winInfo, balances }) => {
  if (playerId === myId) {
    // Only deduct bet visually immediately
    currentBalance = balances[myId] - (winInfo.payout > 0 ? winInfo.payout : 0);
    balanceEl.textContent = currentBalance;
    
    animateReelsSequentially(spinResult, winInfo, balances[myId]);
  } else {
    addLog(`Игрок ${playerId.slice(0,4)}... крутит!`);
  }
});

function animateReelsSequentially(matrix, winInfo, finalBalance) {
  if (isSpinning) return;
  isSpinning = true;
  spinBtn.disabled = true;
  clearPaylines();

  const reels = document.querySelectorAll('.reel');
  let scattersFound = 0;

  reels.forEach((reel, col) => {
    // Fast staggered start
    setTimeout(() => {
      reel.classList.remove('bounce');
      reel.classList.add('spinning');
      const symbols = reel.querySelectorAll('.symbol');
      for (let row = 0; row < 3; row++) {
        symbols[row + 9].textContent = SYMBOL_EMOJIS[matrix[row][col]];
      }
    }, col * 20);

    // Base stop delay, quicker spin
    let stopDelay = 350 + col * 100;

    // Count scatters for near‑miss logic
    for (let row = 0; row < 3; row++) {
      if (matrix[row][col] === 'SCATTER') scattersFound++;
    }

    if (col >= 2 && scattersFound >= 2) {
      stopDelay += 1200; // longer pause for near‑miss
      setTimeout(() => reel.classList.add('near-miss'), 30 + col * 100);
    }

    setTimeout(() => {
      reel.classList.remove('spinning', 'near-miss');
      reel.classList.add('bounce');
      const symbols = reel.querySelectorAll('.symbol');
      for (let row = 0; row < 3; row++) {
        symbols[row].textContent = SYMBOL_EMOJIS[matrix[row][col]];
      }

      if (col === 4) {
        // After last reel settle, finish spin
        setTimeout(() => finishSpin(winInfo, finalBalance), 300);
      }
    }, stopDelay);
  });
}

function finishSpin(winInfo, finalBalance) {
  isSpinning = false;
  spinBtn.disabled = false;

  if (winInfo.payout > 0) {
    dimNonWinningSymbols(winInfo.winningLines);
    // Calculate total animation time for all winning lines
    const totalDelay = winInfo.winningLines.length * 600 + 500; 
    
    setTimeout(() => {
      addLog(`💰 ВЫИГРЫШ: ${winInfo.payout}!`, 'gold');
      launchConfetti();
      // Update balance visually ONLY AFTER animation
      currentBalance = finalBalance;
      balanceEl.textContent = currentBalance;
    }, totalDelay);

    winInfo.winningLines.forEach((win, index) => {
      setTimeout(() => {
        drawPayline(win.line, win.cells.length);
        highlightSymbols(win.cells);
      }, index * 600);
    });
  } else {
    // If no win, just update balance (it already was updated minus bet)
    currentBalance = finalBalance;
    balanceEl.textContent = currentBalance;
  }
}


function dimNonWinningSymbols(winningLines) {
  document.querySelectorAll('.symbol').forEach(s => s.classList.add('dimmed'));
  winningLines.forEach(win => {
    win.cells.forEach(cell => {
      const reels = document.querySelectorAll('.reel');
      const symbol = reels[cell.c].querySelectorAll('.symbol')[cell.r];
      symbol.classList.remove('dimmed');
    });
  });
}

function highlightSymbols(cells) {
  cells.forEach(cell => {
    const reels = document.querySelectorAll('.reel');
    const symbol = reels[cell.c].querySelectorAll('.symbol')[cell.r];
    symbol.classList.add('symbol-win-glow');
  });
}

function clearPaylines() {
  paylinesOverlay.innerHTML = '';
  document.querySelectorAll('.symbol').forEach(s => {
    s.classList.remove('symbol-win-glow', 'dimmed');
  });
}

function drawPayline(line, count) {
  // Use a fresh SVG for each line
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "payline-svg");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.overflow = "visible";
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "payline-path");
  
  const overlayRect = paylinesOverlay.getBoundingClientRect();
  let d = "";
  const reels = document.querySelectorAll('.reel');
  
  for (let colIdx = 0; colIdx < count; colIdx++) {
    const rowIdx = line[colIdx];
    const reel = reels[colIdx];
    const symbol = reel.querySelectorAll('.symbol')[rowIdx];
    const symbolRect = symbol.getBoundingClientRect();
    
    const x = (symbolRect.left - overlayRect.left) + (symbolRect.width / 2);
    const y = (symbolRect.top - overlayRect.top) + (symbolRect.height / 2);
    
    d += (colIdx === 0 ? "M " : "L ") + x + " " + y;
  }
  
  path.setAttribute("d", d);
  svg.appendChild(path);
  paylinesOverlay.appendChild(svg);
}

spinBtn.onclick = () => {
  const bet = parseInt(document.getElementById('betAmount').value);
  if (bet > currentBalance) return alert('Недостаточно кредитов!');
  socket.emit('spin', { bet });
};

function addLog(text, color) {
  const div = document.createElement('div');
  div.textContent = text;
  if (color) div.style.color = color;
  winLog.prepend(div);
}

let particles = [];
function launchConfetti() {
  canvas.width = canvas.parentElement.offsetWidth;
  canvas.height = canvas.parentElement.offsetHeight;
  particles = [];
  for (let i = 0; i < 100; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12 - 4,
      size: Math.random() * 5 + 2,
      color: `hsl(${Math.random() * 50 + 35}, 100%, 50%)`,
      life: 1
    });
  }
  requestAnimationFrame(updateParticles);
}

function updateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.01;
    ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 0) requestAnimationFrame(updateParticles);
}

window.onresize = () => {
  clearPaylines();
};

