import React, { useRef, useCallback, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

interface ChatInputProps {
  onSubmit: (text: string, files?: FileList) => void;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = 'describe what you want to build...',
  isStreaming = false,
  onStop,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ImageFile[]>([]);

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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      addImages(Array.from(files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addImages]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && (value.trim() || images.length > 0)) {
        handleSubmitForm();
      }
    }
  };

  const handleSubmitForm = () => {
    const text = value.trim();
    if (!text && images.length === 0) return;

    if (images.length > 0) {
      const dt = new DataTransfer();
      images.forEach(img => dt.items.add(img.file));
      onSubmit(text, dt.files);
    } else {
      onSubmit(text);
    }
    setValue('');
    setImages([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitForm();
  };

  const canSubmit = (value.trim() || images.length > 0) && !disabled;

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      
      <form onSubmit={handleSubmit} className="relative">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-xl bg-white/5 border border-white/10">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.preview}
                  alt="Preview"
                  className="h-14 w-14 object-cover rounded-lg border border-white/10"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#ed4245] text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm focus-within:border-[#5865f2]/40 focus-within:bg-white/[0.05] transition-all duration-200">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 m-1.5 p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            title="Add image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          
          <TextareaAutosize
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            minRows={1}
            maxRows={6}
            autoFocus
            className="flex-1 min-h-[44px] pr-3 py-3 bg-transparent text-sm text-white/90 placeholder:text-white/30 resize-none focus:outline-none"
          />
          
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex-shrink-0 m-1.5 p-2.5 rounded-lg bg-[#ed4245] text-white hover:bg-[#ed4245]/80 transition-all duration-200"
              title="Stop generating"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-shrink-0 m-1.5 p-2.5 rounded-lg transition-all duration-200 ${
                canSubmit
                  ? 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2 px-1">
          <span className="flex items-center gap-1.5 text-[10px] text-white/30">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[9px] text-white/50">↵</kbd>
            <span>send</span>
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-white/30">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[9px] text-white/50">⇧↵</kbd>
            <span>new line</span>
          </span>
        </div>
      </form>
    </div>
  );
};
