const crypto = require('crypto');

// Symbol Payout Table (multipliers for 3, 4, 5 symbols)
const PAYTABLE = {
  CHERRY:     { 3: 2,  4: 10, 5: 50 },
  LEMON:      { 3: 2,  4: 10, 5: 50 },
  WATERMELON: { 3: 5,  4: 20, 5: 100 },
  GOLD_BAR:   { 3: 10, 4: 50, 5: 250 },
  CROWN:      { 3: 20, 4: 100, 5: 1000 },
  SCATTER:    { 3: 0,  4: 0,  5: 0 } // Scatter triggers bonus, not direct payout
};

const SYMBOLS = [
  { name: 'CHERRY',     weight: 18 },
  { name: 'LEMON',      weight: 18 },
  { name: 'WATERMELON', weight: 15 },
  { name: 'GOLD_BAR',   weight: 8 },
  { name: 'CROWN',      weight: 4 },
  { name: 'WILD',       weight: 3.5, wild: true },
  { name: 'SCATTER',    weight: 2,   scatter: true }
];

const CUMULATIVE = [];
let totalSum = 0;
for (const s of SYMBOLS) {
  totalSum += s.weight;
  CUMULATIVE.push({ name: s.name, limit: totalSum });
}

// 20 Fixed Paylines
const PAYLINES = [
  [1, 1, 1, 1, 1], // 1: Middle Row
  [0, 0, 0, 0, 0], // 2: Top Row
  [2, 2, 2, 2, 2], // 3: Bottom Row
  [0, 1, 2, 1, 0], // 4: V-shape
  [2, 1, 0, 1, 2], // 5: Inverted V
  [0, 0, 1, 0, 0], // 6: Small wave top
  [2, 2, 1, 2, 2], // 7: Small wave bottom
  [1, 0, 0, 0, 1], // 8: U-shape top
  [1, 2, 2, 2, 1], // 9: U-shape bottom
  [0, 1, 0, 1, 0], // 10: Zigzag top
  [2, 1, 2, 1, 2], // 11: Zigzag bottom
  [1, 0, 1, 0, 1], // 12: M-shape
  [1, 2, 1, 2, 1], // 13: W-shape
  [0, 1, 1, 1, 0], // 14: Center bridge top
  [2, 1, 1, 1, 2], // 15: Center bridge bottom
  [0, 0, 1, 2, 2], // 16: Step down
  [2, 2, 1, 0, 0], // 17: Step up
  [1, 2, 2, 1, 1], // 18: Lower step
  [1, 0, 0, 1, 1], // 19: Upper step
  [0, 2, 0, 2, 0]  // 20: Cross
];

function spinReel(wildBoost = 0) {
  const adjustedWildWeight = 3.5 + wildBoost;
  const currentTotal = totalSum - 3.5 + adjustedWildWeight;
  const r = Math.random() * currentTotal;
  let acc = 0;
  for (const entry of CUMULATIVE) {
    const w = (entry.name === 'WILD') ? adjustedWildWeight : SYMBOLS.find(s => s.name === entry.name).weight;
    acc += w;
    if (r < acc) return entry.name;
  }
  return 'CHERRY';
}

function spinReels(wildBoost = 0) {
  const rows = 3, cols = 5;
  const matrix = Array.from({ length: rows }, () => Array(cols));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      matrix[r][c] = spinReel(wildBoost);
    }
  }
  return matrix;
}

function evaluateSpin(matrix, bet) {
  let totalPayout = 0;
  const winningLines = [];

  PAYLINES.forEach((line, lineIndex) => {
    const symbolsOnLine = line.map((rowIdx, colIdx) => matrix[rowIdx][colIdx]);
    
    // Determine the base symbol (first symbol that isn't Wild)
    let baseSymbol = symbolsOnLine[0];
    let firstNonWild = symbolsOnLine.find(s => s !== 'WILD' && s !== 'SCATTER');
    
    if (!firstNonWild) firstNonWild = 'WILD'; // All wilds

    // Left-to-Right logic
    let matchCount = 1;
    // The first symbol must be either the target or a Wild
    if (symbolsOnLine[0] !== firstNonWild && symbolsOnLine[0] !== 'WILD') {
      matchCount = 0; 
    } else {
      for (let i = 1; i < symbolsOnLine.length; i++) {
        if (symbolsOnLine[i] === firstNonWild || symbolsOnLine[i] === 'WILD') {
          matchCount++;
        } else {
          break;
        }
      }
    }

    if (matchCount >= 3 && firstNonWild !== 'SCATTER' && firstNonWild !== 'WILD') {
      const multiplier = PAYTABLE[firstNonWild][matchCount];
      const payout = bet * multiplier;
      totalPayout += payout;
      
      // Coordinates for client animation
      const cells = line.slice(0, matchCount).map((rowIdx, colIdx) => ({ r: rowIdx, c: colIdx }));
      
      winningLines.push({
        lineIndex,
        line,
        symbol: firstNonWild,
        count: matchCount,
        payout,
        cells
      });
    }
  });

  // Scatter check (anywhere on board)
  const flat = matrix.flat();
  const scatterCount = flat.filter(s => s === 'SCATTER').length;
  const freeSpins = scatterCount >= 3 ? 10 : 0;

  return {
    payout: Math.floor(totalPayout),
    winningLines,
    scatterCount,
    freeSpins
  };
}

module.exports = { spinReels, evaluateSpin, SYMBOLS, PAYLINES };
