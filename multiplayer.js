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
      console.log('[mp] room write succeeded');
      mpSubscribe();
      const link = window.location.origin + window.location.pathname + '?room=' + roomId;
      mpShowStatus(`Room created — you are White. Share this link with your friend:`, link);
      render();
    }).catch(err => {
      console.error('[mp] room write failed', err);
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
  if (link) {
    const linkRow = document.createElement('div');
    linkRow.className = 'mp-link-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = link;
    const btn = document.createElement('button');
    btn.textContent = 'Copy';
    btn.onclick = () => {
      navigator.clipboard.writeText(link);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    };
    linkRow.appendChild(input);
    linkRow.appendChild(btn);
    el.appendChild(linkRow);
  }
}

function mpInit() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) mpJoinRoom(room);
}
