import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              type?: 'standard' | 'icon';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google script failed')), {
          once: true,
        });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google script failed'));
      document.head.appendChild(script);
    });
  }
  return googleScriptPromise;
}

export function GoogleSignInButton({
  text = 'continue_with',
  disabled,
  disabledLabel = '请先填写邀请码',
  onCredential,
}: {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  disabled?: boolean;
  disabledLabel?: string;
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState(DEFAULT_PUBLIC_SETTINGS.googleClientId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchPublicSettings()
      .then((settings) => {
        if (alive) setClientId(settings.googleClientId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || disabled || !ref.current) return;
    let alive = true;
    void loadGoogleScript()
      .then(() => {
        if (!alive || !ref.current || !window.google?.accounts?.id) return;
        ref.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredential(response.credential);
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text,
          width: 336,
        });
      })
      .catch(() => {
        if (alive) setError('Google 登录组件加载失败');
      });
    return () => {
      alive = false;
    };
  }, [clientId, disabled, onCredential, text]);

  if (!clientId) return null;
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="flex h-10 w-full items-center justify-center rounded-xl border border-black/10 bg-white/50 text-sm text-text-secondary opacity-60"
      >
        {disabledLabel}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div ref={ref} className="flex justify-center" />
      {error && <div className="text-center text-xs text-red-600">{error}</div>}
    </div>
  );
}
