import { PLAY_COST, allowArcadeEntry, getArcadeSettings, getRewardTiers, inMemberApp, prepareArcadeRound, requestMember } from './s-wallet.js';

let tiers = [
  { limit: 9000, reward: 1000 },
  { limit: 11000, reward: 500 },
  { limit: 13000, reward: 200 },
];
let cost = PLAY_COST;
let size = 5;
const bestKey = 'skclub-number-chase-best-v1';
const lobby = document.querySelector('.shell');
const entry = document.querySelector('[data-game="numbers"]');
const byId = id => document.getElementById(id);
const screen = byId('gameScreen');
const board = byId('board');
const clock = byId('clock');
const target = byId('target');
const notice = byId('notice');
const back = byId('backBtn');
const help = byId('numberHelp');
const popup = byId('popup');
const popupOk = byId('popupOk');
const balance = byId('numberBalance');
const numberFormat = new Intl.NumberFormat('zh-TW');

let state = 'idle';
let next = 1;
let startedAt = null;
let frame;
let round;
let memberBalance;
let moves = [];
let boardRequest = 0;
let payment;

const formatTime = ms => (ms / 1000).toFixed(3) + 's';

function updateBalance() {
  balance.textContent = memberBalance ? numberFormat.format(memberBalance.sc_balance + memberBalance.s_balance) : '—';
}

async function prepareBoard() {
  if (!inMemberApp) {
    notice.textContent = "請從會員系統登入後開始遊戲。";
    return false;
  }
  const request = ++boardRequest;
  const prepared = await prepareArcadeRound('numbers');
  if (request !== boardRequest) return false;
  if (!prepared?.success) {
    notice.textContent = prepared?.status === 401 ? '請先登入會員。' : prepared?.error || '暫時無法取得遊戲棋盤。';
    return false;
  }
  round = prepared;
  cost = round.rules.cost;
  size = round.rules.grid;
  tiers = getRewardTiers(round.rules);
  const player = await requestMember('player');
  if (request !== boardRequest) return false;
  if (player?.success) memberBalance = {
    sc_balance: Number(player.user.sc_balance || 0), s_balance: Number(player.user.s_balance || 0),
  };
  return true;
}

function bestTime() {
  try {
    return Number(localStorage.getItem(size === 5 ? bestKey : bestKey + '-' + size)) || 0;
  } catch {
    return 0;
  }
}

function reset() {
  cancelAnimationFrame(frame);
  state = 'idle';
  startedAt = null;
  next = 1;
  moves = [];
  payment = null;
  clock.textContent = formatTime(0);
  target.textContent = '1';
  const best = bestTime();
  byId('record').textContent = best ? formatTime(best) : '—';
  board.style.setProperty('--number-columns', size);
  board.setAttribute('aria-label', '1 至 ' + size * size + ' 數字方格');
  board.replaceChildren();
  for (const [position, number] of round.board.entries()) {
    const button = document.createElement('button');
    button.className = 'cell';
    button.type = 'button';
    button.textContent = String(number);
    button.setAttribute('aria-label', '數字 ' + number);
    button.addEventListener('click', event => hit(number, position, button, event.timeStamp));
    board.append(button);
  }
  back.disabled = false;
  notice.textContent = '點擊數字 1 扣 ' + cost + ' 幣（SC 幣優先）' + '並開始計時';
  updateBalance();
}

function begin(position, button, time) {
  startedAt = time;
  moves.push(position);
  button.disabled = true;
  state = 'playing';
  frame = requestAnimationFrame(tick);
  next = 2;
  target.textContent = '2';
  notice.textContent = '繼續尋找 2！';
  back.disabled = true;

  payment = confirmPayment(round.id);
}

async function confirmPayment(id) {
  let result;
  try {
    result = await requestMember('round', 'numbers', 'start', { id });
    if (!result?.success && !result?.status) result = await requestMember('round', 'numbers', 'start', { id });
  } catch (error) {
    console.error('Unable to start number chase:', error);
  }
  if (result?.success && result.status === 'playing') {
    memberBalance = result;
    updateBalance();
    if (state === 'playing') back.disabled = false;
    return true;
  }
  reset();
  notice.textContent = result?.error || '暫時無法開始，請再試一次。';
  return false;
}

function tick() {
  clock.textContent = formatTime(Math.ceil(performance.now() - startedAt));
  frame = requestAnimationFrame(tick);
}

function hit(number, position, button, time) {
  if (help.open) return;
  if (state === 'idle' && number === 1) {
    begin(position, button, time);
    return;
  }
  if (state !== 'playing' || number !== next) return;
  moves.push(position);
  button.disabled = true;
  if (number === size * size) {
    void finish(Math.max(1, Math.ceil(time - startedAt)));
    return;
  }
  next++;
  target.textContent = String(next);
  notice.textContent = '繼續尋找 ' + next + '！';
}

async function finish(elapsed) {
  state = 'settling';
  back.disabled = true;
  cancelAnimationFrame(frame);
  clock.textContent = formatTime(elapsed);
  notice.textContent = '正在確認本局與獎勵…';
  if (!(await payment)) return;
  let payout = await requestMember('round', 'numbers', 'finish', { id: round.id, moves });
  if (!payout?.success && !payout?.status) payout = await requestMember('round', 'numbers', 'finish', { id: round.id, moves });
  if (payout?.success) {
    elapsed = payout.elapsed ?? elapsed;
    memberBalance = payout;
  }
  clock.textContent = formatTime(elapsed);
  target.textContent = '✓';
  const previous = bestTime();
  const isBest = payout?.success && (!previous || elapsed < previous);
  if (isBest) {
    try { localStorage.setItem(size === 5 ? bestKey : bestKey + '-' + size, String(elapsed)); } catch {}
    byId('record').textContent = formatTime(elapsed);
  }

  const reward = payout?.reward || 0;
  const rewardText = payout?.success
    ? '本局獲得 ' + numberFormat.format(reward) + ' S 幣'
    : payout?.error || '本局暫時無法結算';
  updateBalance();
  notice.textContent = rewardText;
  byId('popupTitle').textContent = isBest ? '新紀錄！' : '挑戰完成！';
  byId('popupText').textContent = '完成時間 ' + formatTime(elapsed) + '\n' + rewardText;
  popupOk.textContent = '再挑戰';
  state = 'result';
  back.disabled = false;
  popup.classList.add('active');
  popupOk.focus();
}

entry.addEventListener('click', async () => {
  if (entry.disabled) return;
  entry.disabled = true;
  try {
    if (!await allowArcadeEntry()) return;
    await configReady;
  } finally { entry.disabled = closed; }
  if (closed) return;
  lobby.inert = true;
  screen.classList.add('active');
  screen.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  board.replaceChildren();
  notice.textContent = '讀取棋盤中…';
  if (await prepareBoard()) {
    reset();
    help.showModal();
  }
});

function close() {
  if (back.disabled || state === 'settling') return;
  boardRequest++;
  if (help.open) help.close();
  cancelAnimationFrame(frame);
  state = 'idle';
  screen.classList.remove('active');
  popup.classList.remove('active');
  lobby.inert = false;
  document.body.style.overflow = '';
  entry.focus({ preventScroll: true });
}

async function dismissResult() {
  popup.classList.remove('active');
  if (screen.classList.contains('active')) {
    board.replaceChildren();
    notice.textContent = '讀取棋盤中…';
    if (await prepareBoard()) reset();
    if (!back.hidden) back.focus({ preventScroll: true });
  }
}

let closed = false;
const configReady = getArcadeSettings().then(({ numbers }) => {
  if (numbers) {
    size = numbers.grid;
    cost = numbers.cost;
    tiers = getRewardTiers(numbers);
    closed = !numbers.enabled;
    entry.disabled = closed;
  }
  entry.querySelector('.tag').textContent = closed ? '暫停開放' : '可遊玩';
  const mode = '幣（SC 幣優先）';
  const [intro, summary] = help.querySelectorAll('p');
  intro.textContent = numbers?.help || '點擊數字 1 扣 ' + cost + ' ' + mode + ' 並開始計時，接著按順序點到 ' + size * size + '。點錯時繼續計時。';
  summary.textContent = '依完成時間發放一檔獎勵。';
  byId('game-title').nextElementSibling.textContent = '從 1 到 ' + size * size + '，依序點亮砂岩石板';
  for (const tier of [...tiers].reverse()) {
    const row = document.createElement('li');
    row.textContent = (tier.limit / 1000) + ' 秒內完成，獲得 ' + numberFormat.format(tier.reward) + ' S 幣';
    byId('numberTiers').append(row);
  }
});
byId('numberHelpButton').addEventListener('click', () => help.showModal());
back.addEventListener('click', close);
popupOk.addEventListener('click', dismissResult);
popup.addEventListener('click', event => {
  if (event.target === popup) void dismissResult();
});
document.querySelectorAll('[data-game="soon"]').forEach(tile => {
  tile.addEventListener('click', async () => {
    if (!await allowArcadeEntry()) return;
    byId('popupTitle').textContent = '即將開放';
    byId('popupText').textContent = '這座神殿仍在封印中，敬請期待。';
    popupOk.textContent = '知道了';
    popup.classList.add('active');
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || help.open) return;
  if (popup.classList.contains('active')) dismissResult();
  else if (screen.classList.contains('active')) close();
});
