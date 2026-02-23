// ═══════════════════════════════
//  Sudoku logic
// ═══════════════════════════════

function makeEmptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function isValid(grid, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === num) return false;
    if (grid[i][col] === num) return false;
    const br = 3 * Math.floor(row / 3) + Math.floor(i / 3);
    const bc = 3 * Math.floor(col / 3) + (i % 3);
    if (grid[br][bc] === num) return false;
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillGrid(grid) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        const nums = shuffle([1,2,3,4,5,6,7,8,9]);
        for (const num of nums) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num;
            if (fillGrid(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function solveSudoku(grid) {
  // Returns true/false, mutates grid in place
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num;
            if (solveSudoku(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function countSolutions(grid, limit = 2) {
  let count = 0;
  function solve(g) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (isValid(g, r, c, n)) {
              g[r][c] = n;
              solve(g);
              g[r][c] = 0;
              if (count >= limit) return;
            }
          }
          return;
        }
      }
    }
    count++;
  }
  solve(grid.map(r => [...r]));
  return count;
}

const REMOVE_COUNT = { easy: 36, medium: 46, hard: 52, expert: 58 };

function generatePuzzle(difficulty) {
  const solution = makeEmptyGrid();
  fillGrid(solution);

  const puzzle = solution.map(r => [...r]);
  const cells = shuffle([...Array(81).keys()]);
  let removed = 0;
  const target = REMOVE_COUNT[difficulty] || 46;

  for (const idx of cells) {
    if (removed >= target) break;
    const r = Math.floor(idx / 9), c = idx % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle) === 1) {
      removed++;
    } else {
      puzzle[r][c] = backup;
    }
  }

  return { puzzle, solution };
}

// ═══════════════════════════════
//  App state
// ═══════════════════════════════

let puzzle    = makeEmptyGrid();
let solution  = makeEmptyGrid();
let userGrid  = makeEmptyGrid();  // 0 = empty, 1-9 = user answer
let notesGrid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
let given     = Array.from({ length: 9 }, () => Array(9).fill(false));
let errors    = Array.from({ length: 9 }, () => Array(9).fill(false));

let selected  = null;   // { r, c }
let notesMode = false;
let mistakes  = 0;
let seconds   = 0;
let timerInterval = null;
let solved    = false;

// ── History (Undo / Redo) ──
let history      = [];  // [{ r, c, before, after }]
let historyIndex = -1;

// ═══════════════════════════════
//  Undo / Redo
// ═══════════════════════════════

function clearHistory() {
  history = [];
  historyIndex = -1;
  updateUndoRedoButtons();
}

function pushHistory(r, c, before, after) {
  history = history.slice(0, historyIndex + 1);  // drop redo branch
  history.push({ r, c, before, after });
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}

function applySnapshot(r, c, snap) {
  userGrid[r][c]  = snap.userVal;
  notesGrid[r][c] = new Set(snap.notes);
  errors[r][c]    = snap.error;
  mistakes        = snap.mistakes;
  document.getElementById('mistakes').textContent = mistakes;
}

function undo() {
  if (historyIndex < 0) return;
  const { r, c, before } = history[historyIndex];
  applySnapshot(r, c, before);
  historyIndex--;
  updateUndoRedoButtons();
  renderBoard();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  const { r, c, after } = history[historyIndex];
  applySnapshot(r, c, after);
  updateUndoRedoButtons();
  renderBoard();
}

function updateUndoRedoButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.disabled = historyIndex < 0;
  if (r) r.disabled = historyIndex >= history.length - 1;
}

// ═══════════════════════════════
//  Rendering
// ═══════════════════════════════

function buildConflictSet() {
  const conflicts = new Set();
  const val = (r, c) => given[r][c] ? puzzle[r][c] : userGrid[r][c];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = val(r, c);
      if (v === 0) continue;
      for (let i = 0; i < 9; i++) {
        if (i !== c && val(r, i) === v) { conflicts.add(`${r},${c}`); conflicts.add(`${r},${i}`); }
        if (i !== r && val(i, c) === v) { conflicts.add(`${r},${c}`); conflicts.add(`${i},${c}`); }
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const rr = br + dr, cc = bc + dc;
          if ((rr !== r || cc !== c) && val(rr, cc) === v) {
            conflicts.add(`${r},${c}`); conflicts.add(`${rr},${cc}`);
          }
        }
      }
    }
  }
  return conflicts;
}

function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', () => selectCell(r, c));
      board.appendChild(cell);
    }
  }
}

function getCellEl(r, c) {
  return document.querySelector(`#board .cell[data-r="${r}"][data-c="${c}"]`);
}

function renderBoard() {
  const conflicts = buildConflictSet();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      renderCell(r, c, conflicts);
    }
  }
  updateRemaining();
}

function renderCell(r, c, conflicts) {
  const el = getCellEl(r, c);
  const val = given[r][c] ? puzzle[r][c] : userGrid[r][c];
  const notes = notesGrid[r][c];

  el.className = 'cell';
  el.innerHTML = '';

  if (given[r][c]) {
    el.classList.add('given');
    el.textContent = puzzle[r][c];
  } else if (userGrid[r][c] !== 0) {
    el.classList.add('user');
    el.textContent = userGrid[r][c];
    if (errors[r][c]) el.classList.add('error');
  } else if (notes.size > 0) {
    // Render notes
    const ng = document.createElement('div');
    ng.className = 'notes-grid';
    for (let n = 1; n <= 9; n++) {
      const s = document.createElement('span');
      s.textContent = notes.has(n) ? n : '';
      ng.appendChild(s);
    }
    el.appendChild(ng);
  }

  // Conflict highlight (duplicate in row / col / 3x3 box)
  if (conflicts && conflicts.has(`${r},${c}`)) {
    el.classList.add('conflict');
  }

  // Highlight
  if (selected) {
    const { r: sr, c: sc } = selected;
    const selVal = given[sr][sc] ? puzzle[sr][sc] : userGrid[sr][sc];

    if (r === sr && c === sc) {
      el.classList.add('selected');
    } else if (r === sr || c === sc || (Math.floor(r/3) === Math.floor(sr/3) && Math.floor(c/3) === Math.floor(sc/3))) {
      el.classList.add('highlight');
    } else if (selVal !== 0 && val === selVal && !errors[r][c]) {
      el.classList.add('same-value');
    }
  }
}

function updateRemaining() {
  let count = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!given[r][c] && userGrid[r][c] === 0) count++;
  document.getElementById('remaining').textContent = count;
}

// ═══════════════════════════════
//  Interaction
// ═══════════════════════════════

function selectCell(r, c) {
  selected = { r, c };
  renderBoard();
}

function inputNumber(num) {
  if (!selected || solved) return;
  const { r, c } = selected;
  if (given[r][c]) return;

  // Snapshot before
  const before = {
    userVal:  userGrid[r][c],
    notes:    new Set(notesGrid[r][c]),
    error:    errors[r][c],
    mistakes: mistakes,
  };

  if (notesMode) {
    if (num === 0) {
      notesGrid[r][c].clear();
    } else {
      if (notesGrid[r][c].has(num)) notesGrid[r][c].delete(num);
      else notesGrid[r][c].add(num);
    }
    userGrid[r][c] = 0;
    errors[r][c] = false;
  } else {
    if (num === 0) {
      userGrid[r][c] = 0;
      errors[r][c] = false;
      notesGrid[r][c].clear();
    } else {
      notesGrid[r][c].clear();
      userGrid[r][c] = num;
      errors[r][c] = (num !== solution[r][c]);
      if (errors[r][c]) {
        mistakes++;
        document.getElementById('mistakes').textContent = mistakes;
      }
    }
  }

  // Snapshot after and push if anything changed
  const after = {
    userVal:  userGrid[r][c],
    notes:    new Set(notesGrid[r][c]),
    error:    errors[r][c],
    mistakes: mistakes,
  };
  if (before.userVal !== after.userVal || before.error !== after.error ||
      before.mistakes !== after.mistakes || before.notes.size !== after.notes.size ||
      [...before.notes].some(n => !after.notes.has(n))) {
    pushHistory(r, c, before, after);
  }

  renderBoard();
  checkWin();
}

function checkWin() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (userGrid[r][c] !== solution[r][c] && !given[r][c]) return;
      else if (given[r][c] && puzzle[r][c] !== solution[r][c]) return;
  winGame();
}

function checkAll() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!given[r][c] && userGrid[r][c] !== 0) {
        errors[r][c] = userGrid[r][c] !== solution[r][c];
      }
    }
  }
  renderBoard();
}

function clearUser() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!given[r][c]) {
        userGrid[r][c] = 0;
        errors[r][c] = false;
        notesGrid[r][c].clear();
      }
  clearHistory();
  renderBoard();
}

function reveal() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!given[r][c]) {
        userGrid[r][c] = solution[r][c];
        errors[r][c] = false;
        notesGrid[r][c].clear();
      }
  solved = true;
  stopTimer();
  renderBoard();
}

function winGame() {
  solved = true;
  stopTimer();
  const msg = `Completed in ${document.getElementById('timer').textContent} with ${mistakes} mistake${mistakes !== 1 ? 's' : ''}.`;
  document.getElementById('win-msg').textContent = msg;
  document.getElementById('overlay').classList.add('show');
}

// ═══════════════════════════════
//  Timer
// ═══════════════════════════════

function startTimer() {
  stopTimer();
  seconds = 0;
  timerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// ═══════════════════════════════
//  New game
// ═══════════════════════════════

function newGame() {
  document.getElementById('overlay').classList.remove('show');
  solved = false;
  mistakes = 0;
  selected = null;
  notesMode = false;
  updateNotesBtn();
  document.getElementById('mistakes').textContent = '0';
  clearHistory();

  const diff = document.getElementById('difficulty').value;
  const result = generatePuzzle(diff);
  puzzle   = result.puzzle;
  solution = result.solution;

  userGrid  = makeEmptyGrid();
  notesGrid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
  errors    = Array.from({ length: 9 }, () => Array(9).fill(false));
  given     = Array.from({ length: 9 }, () => Array(9).fill(false));

  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] !== 0) given[r][c] = true;

  renderBoard();
  startTimer();
}

// ═══════════════════════════════
//  Numpad
// ═══════════════════════════════

function buildNumpad() {
  const pad = document.getElementById('numpad');
  pad.innerHTML = '';

  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.onclick = () => inputNumber(n);
    pad.appendChild(btn);
  }

  const eraseBtn = document.createElement('button');
  eraseBtn.textContent = '⌫';
  eraseBtn.className = 'erase';
  eraseBtn.onclick = () => inputNumber(0);
  pad.appendChild(eraseBtn);

  const notesBtn = document.createElement('button');
  notesBtn.id = 'notes-btn';
  notesBtn.textContent = 'Notes';
  notesBtn.className = 'notes-toggle';
  notesBtn.onclick = () => {
    notesMode = !notesMode;
    updateNotesBtn();
  };
  pad.appendChild(notesBtn);
}

function updateNotesBtn() {
  const btn = document.getElementById('notes-btn');
  if (!btn) return;
  btn.classList.toggle('active', notesMode);
  btn.textContent = notesMode ? 'Notes ON' : 'Notes';
}

// ═══════════════════════════════
//  Keyboard support
// ═══════════════════════════════

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return; }
  if (e.key >= '1' && e.key <= '9') { inputNumber(parseInt(e.key)); return; }
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { inputNumber(0); return; }
  if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; updateNotesBtn(); return; }

  if (!selected) return;
  const { r, c } = selected;
  const moves = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] };
  if (moves[e.key]) {
    e.preventDefault();
    const [dr, dc] = moves[e.key];
    selectCell(Math.max(0, Math.min(8, r + dr)), Math.max(0, Math.min(8, c + dc)));
  }
});

// ═══════════════════════════════
//  Init
// ═══════════════════════════════

buildBoard();
buildNumpad();
newGame();
