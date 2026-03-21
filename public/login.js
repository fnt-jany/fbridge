const messageEl = document.getElementById('message');
const googleButtonEl = document.getElementById('googleButton');

function setMessage(message, type = '') {
  messageEl.textContent = message;
  messageEl.className = type;
}

function getGoogleButtonWidth() {
  const cardWidth = googleButtonEl.parentElement?.clientWidth || 0;
  const availableWidth = Math.max(220, cardWidth - 48);
  return Math.min(360, availableWidth);
}

async function handleCredentialResponse(response) {
  setMessage('로그인 확인 중...');

  try {
    const res = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '로그인 실패');
    }

    setMessage('로그인 성공. 이동합니다.', 'success');
    window.location.href = '/';
  } catch (err) {
    setMessage(err.message, 'error');
  }
}

async function loadGoogleLogin() {
  setMessage('Google 로그인 준비 중...');

  try {
    const res = await fetch('/auth/google-config');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Google 로그인 설정 오류');
    }

    if (!window.google?.accounts?.id) {
      throw new Error('Google 로그인 스크립트를 불러오지 못했습니다.');
    }

    window.google.accounts.id.initialize({
      client_id: data.clientId,
      callback: handleCredentialResponse,
      auto_select: false,
    });

    googleButtonEl.innerHTML = '';
    window.google.accounts.id.renderButton(googleButtonEl, {
      theme: 'outline',
      size: 'large',
      width: getGoogleButtonWidth(),
      text: 'signin_with',
      shape: 'rectangular',
    });

    setMessage('');
  } catch (err) {
    setMessage(err.message, 'error');
  }
}

loadGoogleLogin();
