export const PLAY_COST = 100;
export const inMemberApp = typeof window !== 'undefined' && window.parent !== window;

export function dismissOnBackdrop(dialog) {
  function isBackdrop(event) {
    if (event.target !== dialog) return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
  }
  let startedOutside = false;
  dialog.addEventListener('pointerdown', event => { startedOutside = isBackdrop(event); });
  dialog.addEventListener('click', event => {
    if (startedOutside && isBackdrop(event)) dialog.close();
    startedOutside = false;
  });
}

export function listenForArcadeBack(goBack) {
  if (!inMemberApp) return;
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'skclub-arcade-back' || !event.ports[0]) return;
    const port = event.ports[0];
    port.postMessage(goBack());
    port.close();
  });
}

export function registerArcadeSubpage(canLeave = () => true) {
  listenForArcadeBack(() => {
    if (canLeave()) setTimeout(() => window.location.replace(new URL('../', window.location.href)), 0);
    return true;
  });
}

export function requestMember(action, ...args) {
  if (!inMemberApp) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = result => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ success: false, error: '會員 API 連線逾時，請再試一次。' }), action === 'settings' ? 5000 : 24000);
    channel.port1.onmessage = event => finish(event.data);
    window.parent.postMessage({ type: 'skclub-arcade', action, args }, '*', [channel.port2]);
  });
}

export async function allowArcadeEntry() {
  if (!inMemberApp) return true;
  const result = await requestMember('checkLogin');
  if (result?.status === 401) return false;
  if (result?.success) return true;
  window.alert(result?.error || '目前無法確認登入狀態，請重新整理後再試。');
  return false;
}

function askForArcadeProof(url) {
  return new Promise(resolve => {
    const challenge = new URL(url);
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog game-help arcade-proof-dialog';
    const title = document.createElement('h2');
    title.textContent = '遊戲安全驗證';
    const frame = document.createElement('iframe');
    frame.title = title.textContent;
    frame.src = challenge.href;
    frame.style.cssText = 'width:100%;height:210px;border:0';
    const form = document.createElement('form');
    form.method = 'dialog';
    const cancel = document.createElement('button');
    cancel.type = 'submit';
    cancel.className = 'back';
    cancel.textContent = '取消';
    form.append(cancel);
    dialog.append(title, frame, form);
    let proof = null;
    function accept(event) {
      if (event.origin !== challenge.origin || event.source !== frame.contentWindow ||
          event.data?.type !== 'skclub-arcade-proof' || typeof event.data.token !== 'string') return;
      proof = event.data.token;
      dialog.close();
    }
    const timeout = setTimeout(() => dialog.close(), 90000);
    dialog.addEventListener('close', () => {
      clearTimeout(timeout);
      window.removeEventListener('message', accept);
      dialog.remove();
      resolve(proof);
    }, { once: true });
    window.addEventListener('message', accept);
    document.body.append(dialog);
    dismissOnBackdrop(dialog);
    dialog.showModal();
  });
}

export async function prepareArcadeRound(game) {
  const result = await requestMember('round', game, 'prepare');
  if (!result?.challengeUrl) return result;
  const proof = await askForArcadeProof(result.challengeUrl);
  if (!proof) return { success: false, error: '尚未完成安全驗證，本局未開始。' };
  return requestMember('round', game, 'prepare', { proof });
}

let settingsRequest;
async function loadArcadeSettings() {
  if (!inMemberApp) return {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await requestMember('settings');
    if (result?.success && result.settings) return result.settings;
  }
  settingsRequest = undefined;
  return {};
}

export function getArcadeSettings() {
  return settingsRequest ??= loadArcadeSettings();
}

export function getRewardTiers(settings) {
  return [1, 2, 3].map(index => ({
    limit: settings['limit' + index], reward: settings['reward' + index],
  })).sort((a, b) => a.limit - b.limit || b.reward - a.reward);
}
