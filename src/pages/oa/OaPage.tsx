import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

export function OaPage() {
  const [oaUrl, setOaUrl] = useState(DEFAULT_PUBLIC_SETTINGS.oaUrl);

  useEffect(() => {
    let alive = true;
    void fetchPublicSettings()
      .then((data) => {
        if (!alive) return;
        setOaUrl(data.oaUrl);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="h-full min-h-0 flex flex-col animate-fade-in-up">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold text-text-primary">OA</h1>
          <p className="text-sm text-text-secondary truncate">{oaUrl}</p>
        </div>
        <a
          href={oaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-black/10 bg-white/70 text-sm text-text-secondary hover:bg-white hover:text-text-primary"
        >
          <ExternalLink size={15} /> 新窗口打开
        </a>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <iframe
          src={oaUrl}
          title="OA"
          className="h-full w-full border-0"
          referrerPolicy="same-origin"
        />
      </div>
    </div>
  );
}
