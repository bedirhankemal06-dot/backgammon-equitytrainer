// ---------- Multiplayer (Firebase Realtime Database) ----------
const MP = {
  active: false,
  roomId: null,
  myColor: 'white',
  ref: null,
};

function mpMyColor() {
  return MP.active ? MP.myColor : 'white';
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function mpExtractSyncable(s) {
  return {
    points: s.points,
    offWhite: s.offWhite,
    offBlack: s.offBlack,
    turn: s.turn,
    dice: s.dice,
    diceUsed: s.diceUsed,
    gameOver: s.gameOver,
    log: s.log.slice(-30),
  };
}

function mpPushState() {
  if (!MP.active || !MP.ref) return;
  MP.ref.update(mpExtractSyncable(state));
}

function mpApplyRemote(data) {
  if (!state) state = freshState();
  state.points = data.points || state.points;
  state.offWhite = data.offWhite || 0;
  state.offBlack = data.offBlack || 0;
  state.turn = data.turn || 'white';
  state.dice = data.dice || [];
  state.diceUsed = data.diceUsed || [];
  state.gameOver = !!data.gameOver;
  state.log = data.log || [];
  render();
  if (state.gameOver) showRating();
}

function mpSubscribe() {
  MP.ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    mpApplyRemote(data);
  });
}

function mpCreateRoom() {
  console.log('[mp] Create Game clicked');
  try {
    const roomId = randomRoomId();
    state = freshState();
    undoStack = [];

    MP.active = true;
    MP.roomId = roomId;
    MP.myColor = 'white';
    MP.ref = firebase.database().ref('games/' + roomId);
    console.log('[mp] room ref created', roomId);

    const initial = mpExtractSyncable(state);
    initial.meta = { hostColor: 'white', guestJoined: false };

    MP.ref.set(initial).then(() => {
      mpSubscribe();
      mpShowRoomCode(roomId);
      render();
    }).catch(err => {
      mpShowStatus('Could not create room: ' + err.message, null);
    });
  } catch (err) {
    console.error('[mp] mpCreateRoom threw synchronously', err);
    mpShowStatus('Error: ' + err.message, null);
  }
}

function mpJoinRoom(roomId) {
  MP.active = true;
  MP.roomId = roomId;
  MP.myColor = 'black';
  MP.ref = firebase.database().ref('games/' + roomId);

  MP.ref.once('value').then(snap => {
    if (!snap.exists()) {
      mpShowStatus('Room not found. Ask your friend for a fresh link.', null);
      MP.active = false;
      return;
    }
    MP.ref.child('meta/guestJoined').set(true);
    mpSubscribe();
    mpShowStatus('Joined as Black.', null);
  }).catch(err => mpShowStatus('Could not join room: ' + err.message, null));
}

function mpShowStatus(text, link) {
  const el = document.getElementById('mp-status');
  el.innerHTML = '';
  const p = document.createElement('div');
  p.textContent = text;
  el.appendChild(p);
}

function mpShowRoomCode(roomId) {
  const el = document.getElementById('mp-status');
  el.innerHTML = '';

  const label = document.createElement('div');
  label.textContent = 'You are White — share this code with your friend:';
  label.style.cssText = 'font-size:0.82rem;color:var(--on-surface-variant);margin-bottom:10px;';
  el.appendChild(label);

  const codeRow = document.createElement('div');
  codeRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;';

  const codeDisplay = document.createElement('div');
  const half1 = roomId.slice(0, 3);
  const half2 = roomId.slice(3);
  codeDisplay.textContent = half1 + ' — ' + half2;
  codeDisplay.style.cssText = [
    'font-family:Geist Mono,monospace',
    'font-size:clamp(1.6rem,5vw,2.2rem)',
    'font-weight:700',
    'letter-spacing:0.18em',
    'color:var(--tertiary)',
    'background:var(--surface-container)',
    'border:1.5px solid var(--tertiary)',
    'border-radius:0.5rem',
    'padding:10px 20px',
    'user-select:all',
  ].join(';');
  codeRow.appendChild(codeDisplay);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'COPY';
  copyBtn.style.cssText = 'min-width:70px;padding:10px 14px;font-size:0.72rem;';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(roomId);
    copyBtn.textContent = 'COPIED!';
    setTimeout(() => (copyBtn.textContent = 'COPY'), 1800);
  };
  codeRow.appendChild(copyBtn);
  el.appendChild(codeRow);

  const hint = document.createElement('div');
  hint.textContent = 'Waiting for opponent to join…';
  hint.style.cssText = 'font-size:0.75rem;color:var(--on-surface-variant);margin-top:8px;';
  el.appendChild(hint);
}

function mpInit() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) mpJoinRoom(room);
}
