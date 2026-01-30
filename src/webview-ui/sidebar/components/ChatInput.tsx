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
          <div className="flex flex-wrap gap-2 mb-2 p-2 rounded bg-[#3c3c3c] border border-white/10">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.preview}
                  alt="Preview"
                  className="h-12 w-12 object-cover rounded border border-white/10"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-[#f44336] text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-1 rounded border border-white/10 bg-[#3c3c3c] focus-within:border-[#3794ff]/50 transition-all duration-150">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 m-1 p-1.5 rounded text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
            title="Add image"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            className="flex-1 min-h-[36px] pr-2 py-2.5 bg-transparent text-[12px] text-white/85 placeholder:text-white/30 resize-none focus:outline-none"
          />
          
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex-shrink-0 m-1 p-2 rounded bg-[#f44336] text-white hover:bg-[#f44336]/80 transition-all duration-150"
              title="Stop generating"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-shrink-0 m-1 p-2 rounded transition-all duration-150 ${
                canSubmit
                  ? 'bg-[#3794ff] text-white hover:bg-[#3794ff]/80'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1.5 px-1">
          <span className="flex items-center gap-1 text-[9px] text-white/25">
            <kbd className="px-1 py-0.5 rounded bg-[#3c3c3c] border border-white/10 font-mono text-[8px] text-white/40">↵</kbd>
            <span>send</span>
          </span>
          <span className="flex items-center gap-1 text-[9px] text-white/25">
            <kbd className="px-1 py-0.5 rounded bg-[#3c3c3c] border border-white/10 font-mono text-[8px] text-white/40">⇧↵</kbd>
            <span>new line</span>
          </span>
        </div>
      </form>
    </div>
  );
};
