// ---------- State ----------
// points[1..24]: positive = white checkers, negative = black checkers
// points[0] = white on bar, points[25] = black on bar
// White moves 24 -> 1 (bears off below 1). Black moves 1 -> 24 (bears off above 24).

let state = null;
let undoStack = [];

function freshState() {
  const points = new Array(26).fill(0);
  points[24] = 2;
  points[13] = 5;
  points[8] = 3;
  points[6] = 5;
  points[1] = -2;
  points[12] = -5;
  points[17] = -3;
  points[19] = -5;
  return {
    points,
    offWhite: 0,
    offBlack: 0,
    turn: 'white',
    dice: [],     // remaining die values this turn
    diceUsed: [],
    selected: null, // currently selected source point (number, 0 = white bar)
    gameOver: false,
    stats: { decisions: 0, totalError: 0 },
    log: [],
  };
}

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

// ---------- Pip counts & equity ----------
function whitePipCount(s) {
  let total = s.points[0] * 25;
  for (let p = 1; p <= 24; p++) if (s.points[p] > 0) total += s.points[p] * p;
  return total;
}

function blackPipCount(s) {
  let total = s.points[25] * 25;
  for (let p = 1; p <= 24; p++) if (s.points[p] < 0) total += (-s.points[p]) * (25 - p);
  return total;
}

// Equity from white's perspective: higher is better for white.
function equityForWhite(s) {
  return blackPipCount(s) - whitePipCount(s);
}

// ---------- Helpers ----------
function cloneState(s) {
  return {
    points: s.points.slice(),
    offWhite: s.offWhite,
    offBlack: s.offBlack,
  };
}

function allWhiteInHome(s) {
  if (s.points[0] > 0) return false;
  for (let p = 7; p <= 24; p++) if (s.points[p] > 0) return false;
  return true;
}

function allBlackInHome(s) {
  if (s.points[25] > 0) return false;
  for (let p = 1; p <= 18; p++) if (s.points[p] < 0) return false;
  return true;
}

// Generate legal moves for `player` ('white'|'black') using a single die value,
// given current points/off state (ignores s.dice/turn bookkeeping).
function legalMovesForDie(s, player, die) {
  const moves = [];
  if (player === 'white') {
    if (s.points[0] > 0) {
      const dest = 25 - die;
      if (canLandWhite(s, dest)) moves.push({ from: 0, to: dest, die });
      return moves; // must enter from bar first
    }
    const canBearOff = allWhiteInHome(s);
    for (let p = 1; p <= 24; p++) {
      if (s.points[p] <= 0) continue;
      const dest = p - die;
      if (dest >= 1) {
        if (canLandWhite(s, dest)) moves.push({ from: p, to: dest, die });
      } else if (canBearOff) {
        if (dest === 0) {
          moves.push({ from: p, to: -1, die }); // exact bear off
        } else if (dest < 0) {
          let higherExists = false;
          for (let q = p + 1; q <= 6; q++) if (s.points[q] > 0) { higherExists = true; break; }
          if (!higherExists) moves.push({ from: p, to: -1, die });
        }
      }
    }
  } else {
    if (s.points[25] > 0) {
      const dest = die;
      if (canLandBlack(s, dest)) moves.push({ from: 25, to: dest, die });
      return moves;
    }
    const canBearOff = allBlackInHome(s);
    for (let p = 1; p <= 24; p++) {
      if (s.points[p] >= 0) continue;
      const dest = p + die;
      if (dest <= 24) {
        if (canLandBlack(s, dest)) moves.push({ from: p, to: dest, die });
      } else if (canBearOff) {
        if (dest === 25) {
          moves.push({ from: p, to: -1, die });
        } else if (dest > 25) {
          let higherExists = false;
          for (let q = 19; q < p; q++) if (s.points[q] < 0) { higherExists = true; break; }
          if (!higherExists) moves.push({ from: p, to: -1, die });
        }
      }
    }
  }
  return moves;
}

function canLandWhite(s, dest) {
  return s.points[dest] >= -1; // ok if empty, own checkers, or single black (hit)
}
function canLandBlack(s, dest) {
  return s.points[dest] <= 1;
}

// Union of legal moves across all currently-remaining dice for a player.
function allLegalMoves(s, player, diceList) {
  const uniqueDice = [...new Set(diceList)];
  const all = [];
  for (const die of uniqueDice) {
    for (const m of legalMovesForDie(s, player, die)) all.push(m);
  }
  return all;
}

// Apply a move to a *board-only* state ({points, offWhite, offBlack}), returns new state.
function applyMove(s, move, player) {
  const ns = cloneState(s);
  if (player === 'white') {
    ns.points[move.from] -= 1;
    if (move.to === -1) {
      ns.offWhite += 1;
    } else {
      if (ns.points[move.to] === -1) { ns.points[move.to] = 0; ns.points[25] += 1; }
      ns.points[move.to] += 1;
    }
  } else {
    if (move.from === 25) {
      ns.points[25] -= 1; // leaving the bar: bar count is stored positive, so decrement
    } else {
      ns.points[move.from] += 1; // leaving a normal point: black count is stored negative
    }
    if (move.to === -1) {
      ns.offBlack += 1;
    } else {
      if (ns.points[move.to] === 1) { ns.points[move.to] = 0; ns.points[0] += 1; }
      ns.points[move.to] -= 1;
    }
  }
  return ns;
}

// ---------- Dice ----------
function rollDice() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
}

const DOT_PATTERNS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function buildDieFace(value) {
  const die = document.createElement('div');
  die.className = 'die';
  const positions = DOT_PATTERNS[value] || [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    if (positions.includes(i)) cell.className = 'dot';
    die.appendChild(cell);
  }
  return die;
}

// ---------- Rendering ----------
const POINT_ORDER = {
  'top-left': [13, 14, 15, 16, 17, 18],
  'top-right': [19, 20, 21, 22, 23, 24],
  'bottom-left': [12, 11, 10, 9, 8, 7],
  'bottom-right': [6, 5, 4, 3, 2, 1],
};

function buildBoardSkeleton() {
  for (const [quadId, pts] of Object.entries(POINT_ORDER)) {
    const quad = document.getElementById(quadId);
    quad.innerHTML = '';
    for (const p of pts) {
      const div = document.createElement('div');
      div.className = 'point';
      div.dataset.point = p;
      const label = document.createElement('div');
      label.className = 'point-label';
      label.textContent = p;
      const checkers = document.createElement('div');
      checkers.className = 'checkers';
      div.appendChild(label);
      div.appendChild(checkers);
      div.addEventListener('click', () => onPointClick(p));
      quad.appendChild(div);
    }
  }
  document.getElementById('bar-top').addEventListener('click', () => onPointClick(25));
  document.getElementById('bar-bottom').addEventListener('click', () => onPointClick(0));
}

function render() {
  for (let p = 1; p <= 24; p++) {
    const div = document.querySelector(`.point[data-point="${p}"]`);
    if (!div) continue;
    const checkersDiv = div.querySelector('.checkers');
    checkersDiv.innerHTML = '';
    const count = state.points[p];
    const color = count > 0 ? 'white' : 'black';
    for (let i = 0; i < Math.abs(count); i++) {
      const c = document.createElement('div');
      c.className = `checker ${color}`;
      if (state.selected === p) c.classList.add('selected');
      checkersDiv.appendChild(c);
    }
    div.classList.toggle('legal', currentLegalDestinations().includes(p) || (state.selected === p));
  }

  renderBar('bar-top', state.points[25], 'black');
  renderBar('bar-bottom', state.points[0], 'white');

  document.getElementById('white-off').textContent = state.offWhite;
  document.getElementById('black-off').textContent = state.offBlack;
  document.getElementById('pip-white').textContent = whitePipCount(state);
  document.getElementById('pip-black').textContent = blackPipCount(state);

  renderDice();
  document.getElementById('log').innerHTML = state.log.slice(-30).reverse().map(l => `<div>${l}</div>`).join('');

  const turnInfo = document.getElementById('turn-info');
  if (state.gameOver) {
    turnInfo.textContent = 'Game over';
  } else {
    turnInfo.textContent = state.turn === 'white' ? "Your turn (White) — click a glowing checker, then a glowing point" : "Opponent's turn (Black)";
  }

  document.getElementById('undo-btn').disabled = undoStack.length === 0 || state.turn !== 'white' || state.gameOver;
}

function renderBar(elId, count, color) {
  const bar = document.getElementById(elId);
  let checkersDiv = bar.querySelector('.checkers');
  if (!checkersDiv) {
    checkersDiv = document.createElement('div');
    checkersDiv.className = 'checkers';
    bar.appendChild(checkersDiv);
  }
  checkersDiv.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = `checker ${color}`;
    checkersDiv.appendChild(c);
  }
  bar.classList.toggle('legal', currentLegalDestinations().includes(elId === 'bar-bottom' ? 0 : 25));
}

function renderDice() {
  const area = document.getElementById('dice-area');
  area.innerHTML = '';
  for (const d of state.diceUsed) {
    const die = buildDieFace(d);
    die.classList.add('used');
    area.appendChild(die);
  }
  for (const d of state.dice) {
    area.appendChild(buildDieFace(d));
  }
}

// Animate the dice rolling, then call onDone(finalValues) once settled.
function animateRoll(finalValues, onDone) {
  const area = document.getElementById('dice-area');
  let ticks = 0;
  const maxTicks = 8;
  const interval = setInterval(() => {
    area.innerHTML = '';
    const count = finalValues.length === 4 ? 2 : finalValues.length;
    for (let i = 0; i < count; i++) {
      const randVal = 1 + Math.floor(Math.random() * 6);
      const die = buildDieFace(randVal);
      die.classList.add('rolling');
      area.appendChild(die);
    }
    ticks++;
    if (ticks >= maxTicks) {
      clearInterval(interval);
      onDone();
    }
  }, 90);
}

// returns list of legal source points (own checkers or bar) the player could currently select from
function currentLegalSources() {
  if (state.gameOver || state.turn !== 'white' || state.dice.length === 0) return [];
  const moves = allLegalMoves(state, 'white', state.dice);
  return [...new Set(moves.map(m => m.from))];
}

// when a source is selected, returns legal destination points for it
function currentLegalDestinations() {
  if (state.selected === null) return [];
  const moves = allLegalMoves(state, 'white', state.dice).filter(m => m.from === state.selected);
  return moves.map(m => m.to);
}

// ---------- Interaction ----------
function onPointClick(p) {
  if (state.gameOver || state.turn !== 'white' || state.dice.length === 0) return;
  const sources = currentLegalSources();

  if (state.selected === null) {
    if (sources.includes(p)) {
      state.selected = p;
      render();
    }
    return;
  }

  if (p === state.selected) {
    state.selected = null;
    render();
    return;
  }

  const candidateMoves = allLegalMoves(state, 'white', state.dice).filter(m => m.from === state.selected && m.to === p);
  if (candidateMoves.length === 0) {
    if (sources.includes(p)) { state.selected = p; render(); }
    return;
  }

  const move = candidateMoves.sort((a, b) => a.die - b.die)[0];
  playWhiteMove(move);
}

function playWhiteMove(move) {
  undoStack.push(snapshot());

  const allOptions = allLegalMoves(state, 'white', state.dice);
  if (allOptions.length > 1) {
    let bestEquity = -Infinity;
    for (const opt of allOptions) {
      const ns = applyMove(state, opt, 'white');
      const eq = equityForWhite(ns);
      if (eq > bestEquity) bestEquity = eq;
    }
    const chosenState = applyMove(state, move, 'white');
    const chosenEquity = equityForWhite(chosenState);
    const error = bestEquity - chosenEquity;
    state.stats.decisions += 1;
    state.stats.totalError += error;
    if (error > 0.0001) {
      state.log.push(`You played ${describeMove(move)} — lost ${error.toFixed(1)} equity (best was ${bestEquity.toFixed(1)}).`);
    } else {
      state.log.push(`You played ${describeMove(move)} — best available move.`);
    }
  } else {
    state.log.push(`You played ${describeMove(move)} (forced).`);
  }

  applyMoveInPlace(move, 'white');
  removeDie(move.die);
  state.selected = null;
  checkGameOver();
  if (!state.gameOver) maybeEndTurn();
  render();
}

function describeMove(move) {
  const from = move.from === 0 ? 'bar' : move.from;
  const to = move.to === -1 ? 'off' : move.to;
  return `${from} -> ${to}`;
}

function applyMoveInPlace(move, player) {
  const ns = applyMove(state, move, player);
  state.points = ns.points;
  state.offWhite = ns.offWhite;
  state.offBlack = ns.offBlack;
}

function removeDie(die) {
  const idx = state.dice.indexOf(die);
  if (idx !== -1) state.dice.splice(idx, 1);
  state.diceUsed.push(die);
}

function maybeEndTurn() {
  if (state.dice.length === 0) {
    endTurn();
    return;
  }
  const moves = allLegalMoves(state, 'white', state.dice);
  if (moves.length === 0) {
    state.log.push('No legal moves remaining — turn passes.');
    endTurn();
  }
}

function endTurn() {
  state.dice = [];
  state.diceUsed = [];
  state.selected = null;
  undoStack = [];
  if (state.gameOver) return;
  state.turn = state.turn === 'white' ? 'black' : 'white';
  if (state.turn === 'black') {
    document.getElementById('roll-btn').disabled = true;
    setTimeout(playBlackTurn, 500);
  } else {
    document.getElementById('roll-btn').disabled = false;
  }
}

function doUndo() {
  if (undoStack.length === 0) return;
  state = undoStack.pop();
  render();
}

// ---------- AI (greedy pip/equity maximizer for black) ----------
function playBlackTurn() {
  let dice = rollDice();
  animateRoll(dice, () => {
    state.log.push(`Opponent rolls ${dice.join(', ')}`);
    state.dice = [...dice];
    state.diceUsed = [];
    render();
    setTimeout(step, 400);
  });

  function step() {
    if (dice.length === 0) { finishBlackTurn(); return; }
    const moves = allLegalMoves(state, 'black', dice);
    if (moves.length === 0) {
      state.log.push('Opponent has no legal moves left.');
      finishBlackTurn();
      return;
    }
    let best = null, bestEq = Infinity; // black wants to MINIMIZE equityForWhite
    for (const m of moves) {
      const ns = applyMove(state, m, 'black');
      const eq = equityForWhite(ns);
      if (eq < bestEq) { bestEq = eq; best = m; }
    }
    applyMoveInPlace(best, 'black');
    state.log.push(`Opponent played ${describeMove(best)}.`);
    const idx = dice.indexOf(best.die);
    dice.splice(idx, 1);
    removeDieFromDisplay(best.die);
    render();
    checkGameOver();
    if (state.gameOver) return;
    setTimeout(step, 400);
  }
}

function removeDieFromDisplay(die) {
  const idx = state.dice.indexOf(die);
  if (idx !== -1) state.dice.splice(idx, 1);
  state.diceUsed.push(die);
}

function finishBlackTurn() {
  state.dice = [];
  state.diceUsed = [];
  state.turn = 'white';
  document.getElementById('roll-btn').disabled = false;
  render();
}

// ---------- Game over / rating ----------
function checkGameOver() {
  if (state.offWhite >= 15 || state.offBlack >= 15) {
    state.gameOver = true;
    showRating();
  }
}

function showRating() {
  const won = state.offWhite >= 15;
  const decisions = state.stats.decisions;
  const totalError = state.stats.totalError;
  const avgError = decisions > 0 ? totalError / decisions : 0;
  const rating = Math.max(100, Math.round(1500 - avgError * 12));

  document.getElementById('result-title').textContent = won ? 'You win!' : 'You lose.';
  document.getElementById('stat-decisions').textContent = decisions;
  document.getElementById('stat-total-error').textContent = totalError.toFixed(1);
  document.getElementById('stat-avg-error').textContent = avgError.toFixed(2);
  document.getElementById('stat-rating').textContent = rating;
  document.getElementById('rating-modal').classList.remove('hidden');
}

// ---------- Setup ----------
function newGame() {
  state = freshState();
  undoStack = [];
  document.getElementById('rating-modal').classList.add('hidden');
  document.getElementById('roll-btn').disabled = false;
  render();
}

function doRoll() {
  if (state.dice.length > 0 || state.turn !== 'white' || state.gameOver) return;
  document.getElementById('roll-btn').disabled = true;
  const dice = rollDice();
  animateRoll(dice, () => {
    state.dice = dice;
    state.diceUsed = [];
    state.log.push(`You roll ${state.dice.join(', ')}`);
    const moves = allLegalMoves(state, 'white', state.dice);
    if (moves.length === 0) {
      state.log.push('No legal moves — turn passes.');
      render();
      setTimeout(endTurn, 600);
      return;
    }
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildBoardSkeleton();
  document.getElementById('new-game-btn').addEventListener('click', newGame);
  document.getElementById('roll-btn').addEventListener('click', doRoll);
  document.getElementById('undo-btn').addEventListener('click', doUndo);
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('menu-panel').classList.toggle('hidden');
  });
  document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('rating-modal').classList.add('hidden');
    newGame();
  });
  newGame();
});
