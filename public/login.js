const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const messageEl = document.getElementById('message');

function setMessage(message, type = '') {
  messageEl.textContent = message;
  messageEl.className = type;
}

async function login() {
  loginBtn.disabled = true;
  setMessage('확인 중...');

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordEl.value }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '로그인 실패');
    }

    setMessage('로그인 성공. 이동합니다.', 'success');
    window.location.href = '/';
  } catch (err) {
    setMessage(err.message, 'error');
  } finally {
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', login);
passwordEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    login();
  }
});
