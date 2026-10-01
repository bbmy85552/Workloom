import { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileDropProps {
  accept?: string;
  multiple?: boolean;
  hint?: string;
  busy?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}

export function FileDrop({ accept, multiple, hint, busy, onFiles, className }: FileDropProps) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (files: FileList | null) => {
      if (busy) return;
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [busy, onFiles],
  );

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handle(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors text-center ${
        hover
          ? 'border-liquid-indigo bg-liquid-indigo/5 text-liquid-indigo'
          : 'border-black/15 hover:border-liquid-indigo/50 text-text-secondary'
      } ${busy ? 'pointer-events-none opacity-60' : ''} ${className ?? ''}`}
    >
      <UploadCloud size={28} />
      <div className="text-sm font-medium text-text-primary">
        {busy ? '上传中…' : '点击或将文件拖到这里'}
      </div>
      {hint && <div className="text-xs text-text-secondary">{hint}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
