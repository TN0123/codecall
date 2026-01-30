import React, { useRef, useEffect, useCallback } from 'react';

interface ImageFile {
  id: string;
  file: File;
  preview: string; // base64 data URL
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files?: FileList) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'describe what you want to build...',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = React.useState<ImageFile[]>([]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const addImages = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        setImages(prev => [...prev, {
          id: crypto.randomUUID(),
          file,
          preview,
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id));
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      addImages(files);
    }
  }, [addImages]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      addImages(Array.from(files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addImages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && (value.trim() || images.length > 0)) {
        handleSubmitForm();
      }
    }
  };

  const handleSubmitForm = () => {
    if (images.length > 0) {
      const dt = new DataTransfer();
      images.forEach(img => dt.items.add(img.file));
      onSubmit(dt.files);
    } else {
      onSubmit();
    }
    setImages([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitForm();
  };

  const canSubmit = (value.trim() || images.length > 0) && !disabled;

  return (
    <div className="relative px-3 py-3 border-t border-slate-800/60 bg-surface-1/60 backdrop-blur-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
      
      <form onSubmit={handleSubmit} className="relative">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.preview}
                  alt="Preview"
                  className="h-16 w-16 object-cover rounded-md border border-slate-600/50"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-slate-700/50 bg-surface-2/80 focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all duration-200">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 m-1.5 p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
            title="Add image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-h-[44px] max-h-40 pr-3 py-3 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none"
          />
          
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex-shrink-0 m-1.5 p-2 rounded-lg transition-all duration-200 ${
              canSubmit
                ? 'bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/25'
                : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 mt-2 px-1">
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 font-mono text-[9px]">↵</kbd>
            <span>send</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 font-mono text-[9px]">⇧↵</kbd>
            <span>new line</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 font-mono text-[9px]">⌘V</kbd>
            <span>paste image</span>
          </span>
        </div>
      </form>
    </div>
  );
};
