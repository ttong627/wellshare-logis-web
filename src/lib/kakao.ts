declare global { interface Window { Kakao: any } }

const K = {
  ACCESS: 'kakao_access_token',
  REFRESH: 'kakao_refresh_token',
  EXPIRY: 'kakao_token_expiry',
} as const;

export function initKakao() {
  const jsKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
  if (!jsKey || !window.Kakao || window.Kakao.isInitialized()) return;
  window.Kakao.init(jsKey);
}

export function isKakaoConnected(): boolean {
  return !!localStorage.getItem(K.REFRESH);
}

const CALLBACK_PATH = '/kakao-callback.html';

async function exchangeCode(code: string): Promise<void> {
  const jsKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
  if (!jsKey) throw new Error('VITE_KAKAO_JS_KEY가 설정되지 않았습니다.');
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: jsKey,
      redirect_uri: window.location.origin + CALLBACK_PATH,
      code,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || '카카오 토큰 발급에 실패했습니다.');
  }
  localStorage.setItem(K.ACCESS, data.access_token);
  localStorage.setItem(K.REFRESH, data.refresh_token || '');
  localStorage.setItem(K.EXPIRY, String(Date.now() + data.expires_in * 1000));
}

export function connectKakao(): Promise<void> {
  return new Promise((resolve, reject) => {
    const jsKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    if (!jsKey) {
      reject(new Error('VITE_KAKAO_JS_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'));
      return;
    }

    const redirectUri = window.location.origin + CALLBACK_PATH;
    const authUrl =
      `https://kauth.kakao.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(jsKey)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=talk_message`;

    const popup = window.open(authUrl, 'kakao-auth', 'width=500,height=700,scrollbars=yes,resizable=yes');
    if (!popup) {
      reject(new Error('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.'));
      return;
    }

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'KAKAO_AUTH_CALLBACK') return;
      window.removeEventListener('message', onMessage);
      clearTimeout(tid);

      const { code, error } = event.data as { code?: string; error?: string };
      if (error) {
        reject(new Error(error === 'access_denied' ? '카카오 로그인이 취소되었습니다.' : `카카오 오류: ${error}`));
        return;
      }
      if (code) {
        try { await exchangeCode(code); resolve(); }
        catch (e) { reject(e); }
      } else {
        reject(new Error('인증 코드를 받지 못했습니다.'));
      }
    };

    window.addEventListener('message', onMessage);
    const tid = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('카카오 로그인 시간이 초과되었습니다. 다시 시도해주세요.'));
    }, 5 * 60 * 1000);
  });
}

export function disconnectKakao() {
  localStorage.removeItem(K.ACCESS);
  localStorage.removeItem(K.REFRESH);
  localStorage.removeItem(K.EXPIRY);
}

async function refreshToken(): Promise<string | null> {
  const jsKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
  const refreshToken = localStorage.getItem(K.REFRESH);
  if (!jsKey || !refreshToken) return null;
  try {
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: jsKey,
        refresh_token: refreshToken,
      }).toString(),
    });
    const data = await res.json();
    if (!data.access_token) { disconnectKakao(); return null; }
    localStorage.setItem(K.ACCESS, data.access_token);
    localStorage.setItem(K.EXPIRY, String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) localStorage.setItem(K.REFRESH, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const expiry = parseInt(localStorage.getItem(K.EXPIRY) || '0', 10);
  const token = localStorage.getItem(K.ACCESS);
  if (token && Date.now() < expiry - 5 * 60 * 1000) return token;
  return refreshToken();
}

export async function sendKakaoNotification(message: string): Promise<void> {
  const token = await getValidToken();
  if (!token) return;
  try {
    await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        template_object: JSON.stringify({
          object_type: 'text',
          text: `[웰쉐어 로지스]\n${message}`,
          link: {
            web_url: window.location.origin,
            mobile_web_url: window.location.origin,
          },
        }),
      }).toString(),
    });
  } catch {
    // Kakao 알림 실패 시 무시
  }
}
