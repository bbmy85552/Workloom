import { useEffect, useState } from 'react';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../lib/publicSettings';

export function BrandLogo({
  size = 'md',
  showText = true,
}: {
  size?: 'sm' | 'md';
  showText?: boolean;
}) {
  const [brand, setBrand] = useState(DEFAULT_PUBLIC_SETTINGS);
  const logoSize = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';

  useEffect(() => {
    let alive = true;
    void fetchPublicSettings()
      .then((data) => {
        if (!alive) return;
        setBrand(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo.svg"
        alt={brand.brandName}
        className={`${logoSize} rounded-xl shadow-md shadow-liquid-indigo/20`}
      />
      {showText && (
        <div className="flex flex-col text-left">
          <span className="font-serif font-bold leading-tight text-text-primary">{brand.brandName}</span>
          <span className="text-xs text-text-secondary">{brand.companyName}</span>
        </div>
      )}
    </div>
  );
}
