'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Clipboard, 
  Download, 
  Copy, 
  Check, 
  Trash2, 
  Image as ImageIcon, 
  Sparkles, 
  RefreshCw, 
  Info, 
  Layers, 
  Palette,
  CheckCircle2,
  XCircle,
  Maximize2
} from 'lucide-react';

// Color themes for custom solid backgrounds
const BACKGROUND_PRESETS = [
  { name: 'Transparent', value: 'transparent', class: 'bg-transparent border border-zinc-200' },
  { name: 'Pure White', value: '#ffffff', class: 'bg-white' },
  { name: 'Pitch Black', value: '#000000', class: 'bg-black border border-zinc-800' },
  { name: 'Soft Gray', value: '#f4f4f5', class: 'bg-[#f4f4f5]' },
  { name: 'Warm Cream', value: '#fefcbf', class: 'bg-[#fefcbf]' },
  { name: 'Soft Blue', value: '#dbeafe', class: 'bg-[#dbeafe]' },
  { name: 'Pastel Green', value: '#d1fae5', class: 'bg-[#d1fae5]' },
  { name: 'Dusty Rose', value: '#ffe4e6', class: 'bg-[#ffe4e6]' }
];

export default function Home() {
  // Input State
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Processing State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [accuracyMode, setAccuracyMode] = useState<'isnet' | 'isnet_quint8'>('isnet');
  const [progress, setProgress] = useState<number>(0);
  const [progressKey, setProgressKey] = useState<string>('');

  // Output State
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedDimensions, setProcessedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [selectedBg, setSelectedBg] = useState<string>('transparent');
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  // General App UI State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Clean up Object URLs when they change to prevent memory leaks
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    };
  }, [originalUrl, processedUrl]);

  // Handle Toast timeout cleanup
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Format File Size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Process File selection / upload
  const processInputFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPEG, WEBP).', 'error');
      return;
    }

    // Reset previous outputs
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (processedUrl) {
      URL.revokeObjectURL(processedUrl);
      setProcessedUrl(null);
      setProcessedBlob(null);
      setProcessedDimensions(null);
    }

    const url = URL.createObjectURL(file);
    setOriginalFile(file);
    setOriginalUrl(url);

    // Get image dimensions
    const img = new Image();
    img.onload = () => {
      setOriginalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;

    showToast('Image uploaded successfully! Press "Remove Background" to convert.', 'success');
  }, [originalUrl, processedUrl]);

  // Handle drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processInputFile(e.dataTransfer.files[0]);
    }
  };

  // Handle file select click
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processInputFile(e.target.files[0]);
    }
  };

  // Listen to Paste events (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processInputFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processInputFile]);

  // Core Background Removal Handler
  const handleRemoveBackground = useCallback(async () => {
    if (!originalFile) return;

    try {
      setIsProcessing(true);
      setProgress(0);
      setProgressKey('Loading model config...');

      // Dynamic load @imgly/background-removal on client only
      const { removeBackground } = await import('@imgly/background-removal');

      const resultBlob = await removeBackground(originalFile, {
        model: accuracyMode,
        progress: (key: string, current: number, total: number) => {
          let phase = 'Processing...';
          if (key.includes('fetch')) {
            phase = 'Downloading model weights (runs once)...';
          } else if (key.includes('onnx')) {
            phase = 'Initializing AI models...';
          } else if (key.includes('compute') || key.includes('segment')) {
            phase = 'Analyzing object contours...';
          } else if (key.includes('postprocess')) {
            phase = 'Polishing transparent edges...';
          }

          setProgressKey(phase);
          const percent = Math.round((current / total) * 100);
          setProgress(isNaN(percent) ? 0 : percent);
        }
      });

      if (processedUrl) URL.revokeObjectURL(processedUrl);
      const url = URL.createObjectURL(resultBlob);
      setProcessedBlob(resultBlob);
      setProcessedUrl(url);

      // Get dimensions of output
      const img = new Image();
      img.onload = () => {
        setProcessedDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = url;

      showToast('Background removed beautifully!', 'success');
    } catch (err: any) {
      console.error('Failed to remove background:', err);
      showToast(`Error removing background: ${err.message || 'The model was unable to load or process.'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [originalFile, accuracyMode, processedUrl]);

  // Helper to draw background color behind the image and export/copy
  const getOutputBlobWithBg = useCallback(async (): Promise<Blob> => {
    if (!processedBlob || !processedUrl) {
      throw new Error('No image loaded');
    }

    if (selectedBg === 'transparent') {
      return processedBlob;
    }

    // Create a temporary canvas to burn the solid background color
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        // Fill background
        ctx.fillStyle = selectedBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw transparent PNG over it
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to export canvas blob'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image on canvas'));
      img.src = processedUrl;
    });
  }, [processedBlob, processedUrl, selectedBg]);

  // Copy PNG Handler
  const handleCopy = useCallback(async () => {
    if (!processedBlob) return;

    try {
      const blobToCopy = await getOutputBlobWithBg();
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blobToCopy
        })
      ]);

      setHasCopied(true);
      showToast('PNG copied to clipboard! You can paste it directly into slack, emails, or editors.', 'success');
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
      showToast('Direct copying is restricted in this browser context. Please download the file or right-click to copy.', 'error');
    }
  }, [processedBlob, getOutputBlobWithBg]);

  // Direct Download Handler
  const handleDownload = async () => {
    if (!processedUrl || !processedBlob) return;

    try {
      const blobToDownload = await getOutputBlobWithBg();
      const exportUrl = URL.createObjectURL(blobToDownload);

      const a = document.createElement('a');
      const baseName = originalFile?.name.substring(0, originalFile.name.lastIndexOf('.')) || 'nobg';
      a.href = exportUrl;
      a.download = `${baseName}_nobg.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the temporary export URL
      setTimeout(() => URL.revokeObjectURL(exportUrl), 100);
      showToast('Image downloaded successfully!', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Failed to bake background. Downloading transparent PNG instead.', 'info');

      // Fallback
      const a = document.createElement('a');
      a.href = processedUrl;
      const baseName = originalFile?.name.substring(0, originalFile.name.lastIndexOf('.')) || 'nobg';
      a.download = `${baseName}_nobg.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Bind keyboard shortcuts: Ctrl + C to copy processed image, Enter to trigger background removal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true');

      // Bind Ctrl + C to copy processed image
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (isInput) {
          return;
        }

        if (processedBlob) {
          e.preventDefault();
          handleCopy();
        }
      }

      // Bind Enter to trigger background removal
      if (e.key === 'Enter') {
        if (isInput || (active && active.tagName === 'BUTTON')) {
          return;
        }

        if (originalFile && !isProcessing) {
          e.preventDefault();
          handleRemoveBackground();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processedBlob, handleCopy, originalFile, isProcessing, handleRemoveBackground]);

  // Reset Everything
  const handleClear = () => {
    setOriginalFile(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    setOriginalDimensions(null);

    setProcessedBlob(null);
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setProcessedUrl(null);
    setProcessedDimensions(null);
    setSelectedBg('transparent');
    setProgress(0);
    setProgressKey('');

    showToast('Cleared workspace.', 'info');
  };

  return (
    <main id="app-root" className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] flex flex-col font-sans selection:bg-white/20 transition-colors duration-300">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            id="toast-notification"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl glass text-sm max-w-md w-[90%] text-white"
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-zinc-400 shrink-0" />}
            <span className="font-medium text-white/90 leading-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Layout Wrap */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 md:py-12 flex flex-col gap-8">
        
        {/* Header section with Sophisticated Dark brand and elegant spacing */}
        <header id="header-container" className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border border-white flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
              </div>
              <span className="font-serif italic text-xl tracking-tight text-white select-none">PureMask.</span>
              <span className="text-[10px] uppercase tracking-widest font-mono bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-semibold">
                Local AI
              </span>
            </div>
            <p className="text-white/40 text-xs leading-relaxed max-w-md">
              High-accuracy pixel segmentation running 100% locally in your browser. Paste, convert, and copy instantly.
            </p>
          </div>

          {/* Accuracy Mode Selector */}
          <div className="flex items-center gap-1.5 self-start md:self-auto glass p-1 rounded-full">
            <button
              id="mode-ultra"
              onClick={() => {
                setAccuracyMode('isnet');
                showToast('Switched to Ultra Accurate mode (U2Net Full Model)', 'info');
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                accuracyMode === 'isnet'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/40 hover:text-white/85'
              }`}
            >
              Ultra Accurate
            </button>
            <button
              id="mode-standard"
              onClick={() => {
                setAccuracyMode('isnet_quint8');
                showToast('Switched to Standard mode (Fast Quantized)', 'info');
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                accuracyMode === 'isnet_quint8'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/40 hover:text-white/85'
              }`}
            >
              Standard (Fast)
            </button>
          </div>
        </header>

        {/* Workspace Card Container */}
        <div id="workspace-container" className="flex-1 flex flex-col justify-center min-h-[380px]">
          <AnimatePresence mode="wait">
            
            {!originalUrl ? (
              // Drag & Drop / Clipboard Paste State - Styled elegantly with the theme's glass and checkerboard
              <motion.div
                key="upload-zone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group cursor-pointer relative flex flex-col items-center justify-center border rounded-3xl p-10 md:p-16 text-center transition-all duration-300 glass overflow-hidden min-h-[440px] ${
                  dragActive 
                    ? 'border-white/30 bg-white/[0.06]' 
                    : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                {/* Subtle Checkerboard background pattern */}
                <div className="absolute inset-0 checkerboard opacity-20 pointer-events-none"></div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm">
                  {/* Elegant Vector Icon Holder */}
                  <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center bg-black/40 text-white/60 group-hover:scale-105 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-2xl font-serif italic text-white font-medium">Ready for Image</h2>
                    <p className="text-sm text-white/40 tracking-wide leading-relaxed">
                      Paste an image from your clipboard to begin, or drag & drop.
                    </p>
                  </div>

                  <button className="px-8 py-3 rounded-full glass text-xs uppercase tracking-[0.2em] hover:bg-white/10 transition-all duration-200">
                    Select File
                  </button>

                  {/* Accept Info Badge */}
                  <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-[0.2em] font-mono mt-4">
                    <Layers className="w-3 h-3" />
                    <span>Supports JPG, PNG, WEBP</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              // Active Workspace State - Split-screen elegance
              <motion.div
                key="active-workspace"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch"
              >
                
                {/* Left Panel: Original Image */}
                <div id="original-panel" className="flex flex-col glass rounded-3xl overflow-hidden relative">
                  <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50 flex items-center gap-1.5 font-mono">
                      <ImageIcon className="w-3.5 h-3.5 text-white/40" /> Original Image
                    </span>
                    <button
                      id="btn-clear"
                      onClick={handleClear}
                      className="text-white/40 hover:text-white hover:bg-white/10 transition-all duration-150 p-1.5 rounded-full"
                      title="Clear image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 p-6 flex items-center justify-center min-h-[300px] max-h-[380px] bg-black/20 relative">
                    {/* Subtle Checkerboard background */}
                    <div className="absolute inset-0 checkerboard opacity-10 pointer-events-none"></div>
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="max-w-full max-h-[280px] object-contain rounded-2xl border border-white/5 shadow-2xl relative z-10"
                    />
                  </div>

                  {/* Metadata Bar */}
                  <div className="px-5 py-3 border-t border-white/5 text-[11px] text-white/40 font-mono bg-white/[0.01] flex flex-wrap gap-x-4 gap-y-1 justify-between items-center">
                    <div>
                      NAME: <span className="font-semibold text-white/75 truncate max-w-[150px] inline-block align-bottom">{originalFile?.name}</span>
                    </div>
                    {originalDimensions && (
                      <div>
                        SIZE: <span className="font-semibold text-white/75">{originalDimensions.width} × {originalDimensions.height} PX</span>
                      </div>
                    )}
                    <div>
                      WEIGHT: <span className="font-semibold text-white/75">{originalFile && formatFileSize(originalFile.size)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Panel: Output Image */}
                <div id="processed-panel" className="flex flex-col glass rounded-3xl overflow-hidden relative">
                  <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50 flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-white/40" /> Result Output
                    </span>
                    
                    {processedUrl && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                        <Check className="w-3 h-3" /> Ready
                      </span>
                    )}
                  </div>

                  {/* Main Display Box with Checkerboard transparency pattern */}
                  <div className="flex-1 p-6 flex flex-col items-center justify-center min-h-[300px] max-h-[380px] bg-black/20 relative">
                    
                    <AnimatePresence mode="wait">
                      {!processedUrl ? (
                        // Not started yet / Processing state
                        <motion.div
                          key="result-placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center gap-4 text-center p-6 relative z-10 w-full"
                        >
                          {!isProcessing ? (
                            <>
                              <div className="w-14 h-14 rounded-full border border-white/5 bg-black/40 flex items-center justify-center text-white/30">
                                <Sparkles className="w-5 h-5 animate-pulse" />
                              </div>
                              <div className="space-y-1">
                                <h3 className="font-serif italic text-white text-lg">No Output Yet</h3>
                                <p className="text-xs text-white/40 max-w-[220px] leading-relaxed mx-auto">
                                  Click the conversion button below to run local segmentation.
                                </p>
                              </div>
                            </>
                          ) : (
                            // Is Processing State
                            <div className="w-full max-w-xs flex flex-col gap-5 items-center">
                              {/* Glowing Spinner */}
                              <div className="relative">
                                <div className="w-14 h-14 border-2 border-white/10 border-t-white rounded-full animate-spin"></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-mono font-bold text-white">
                                  {progress}%
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 w-full text-center">
                                <p className="font-serif italic text-white text-lg">{progressKey}</p>
                                <p className="text-[10px] text-white/30 font-mono uppercase tracking-[0.2em]">NEURAL SEGMENTATION IN PROGRESS</p>
                              </div>

                              {/* Simple Progress Rail */}
                              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                  className="bg-white h-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 0.1 }}
                                />
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        // Render Result with checkered backing or chosen background
                        <motion.div
                          key="result-display"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full h-full flex items-center justify-center"
                        >
                          {/* Inner preview box with backing grid */}
                          <div 
                            className="w-full max-w-full max-h-[280px] rounded-xl overflow-hidden border border-white/5 flex items-center justify-center relative shadow-2xl"
                            style={{
                              backgroundColor: selectedBg === 'transparent' ? 'transparent' : selectedBg,
                            }}
                          >
                            {selectedBg === 'transparent' && (
                              <div className="absolute inset-0 checkerboard opacity-40"></div>
                            )}
                            <img
                              src={processedUrl}
                              alt="Result transparent"
                              className="max-w-full max-h-[280px] object-contain select-none relative z-10"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* Preset Background Toggles (Only when processed) */}
                  {processedUrl && (
                    <div className="px-5 py-2.5 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-white/50 font-medium font-mono uppercase tracking-wider">
                        <Palette className="w-3.5 h-3.5 text-white/40" /> Backdrop:
                      </div>
                      <div className="flex items-center gap-1.5">
                        {BACKGROUND_PRESETS.map((preset) => (
                          <button
                            key={preset.value}
                            onClick={() => setSelectedBg(preset.value)}
                            title={preset.name}
                            className={`w-5 h-5 rounded-full transition-all duration-150 relative shrink-0 ${
                              preset.value === 'transparent' 
                                ? 'bg-transparent border border-white/20' 
                                : preset.value === '#ffffff'
                                ? 'bg-white'
                                : preset.value === '#000000'
                                ? 'bg-black border border-white/15'
                                : ''
                            }`}
                            style={{
                              backgroundColor: preset.value !== 'transparent' ? preset.value : undefined,
                            }}
                          >
                            {selectedBg === preset.value && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className={`w-1.5 h-1.5 rounded-full ${preset.value === '#ffffff' ? 'bg-black' : 'bg-white'}`}></span>
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata Bar */}
                  <div className="px-5 py-3 border-t border-white/5 text-[11px] text-white/40 font-mono bg-white/[0.01] flex flex-wrap gap-x-4 gap-y-1 justify-between items-center">
                    <div>
                      FORMAT: <span className="font-semibold text-white/75">PNG (LOSSLESS)</span>
                    </div>
                    {processedDimensions && (
                      <div>
                        SIZE: <span className="font-semibold text-white/75">{processedDimensions.width} × {processedDimensions.height} PX</span>
                      </div>
                    )}
                    {processedBlob && (
                      <div>
                        WEIGHT: <span className="font-semibold text-white/75">{formatFileSize(processedBlob.size)}</span>
                      </div>
                    )}
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Controls Box */}
        {originalUrl && (
          <div id="action-controls" className="flex flex-col md:flex-row items-center justify-between gap-4 glass p-6 rounded-3xl shadow-xl">
            <div className="flex items-center gap-3 self-stretch md:self-auto">
              <button
                id="btn-reset"
                onClick={handleClear}
                disabled={isProcessing}
                className="px-5 py-2.5 text-xs font-mono uppercase tracking-wider font-semibold text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all duration-150 disabled:opacity-50"
              >
                Clear Workspace
              </button>
            </div>

            {/* Main Primary Convert vs Copy/Download Stack */}
            <div className="flex items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-end">
              {!processedUrl ? (
                <button
                  id="btn-remove-bg"
                  onClick={handleRemoveBackground}
                  disabled={isProcessing}
                  className="w-full md:w-auto bg-white hover:bg-white/95 text-black font-semibold text-sm px-8 py-3.5 rounded-full flex items-center justify-center gap-2 transition-all duration-200 shadow-md disabled:opacity-50 cursor-pointer hover:scale-[1.01]"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Removing Background...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Remove Background</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <button
                    id="btn-copy"
                    onClick={handleCopy}
                    className="flex-1 sm:flex-initial glass text-white font-semibold text-sm px-6 py-3 rounded-full flex items-center justify-center gap-2 transition-all duration-200 hover:bg-white/10 cursor-pointer"
                    title="Copy to clipboard (Ctrl + C)"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-white/70" />
                        <span>Copy to Clipboard</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-download"
                    onClick={handleDownload}
                    className="flex-1 sm:flex-initial bg-white hover:bg-white/90 text-black font-semibold text-sm px-8 py-3 rounded-full flex items-center justify-center gap-2 transition-all duration-200 shadow-md cursor-pointer hover:scale-[1.01]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PNG</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Minimalist usage instructions and details in footer container */}
        <footer id="footer-instructions" className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] text-white/30 pt-8 border-t border-white/5">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-white/50 uppercase tracking-[0.2em] text-[10px] font-mono">01. Paste or Drop</span>
            <p className="leading-relaxed">
              Press <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[9px] text-white/60">Ctrl+V</kbd> anywhere on the page to instantly paste screenshots or copied images, or drag-and-drop.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-white/50 uppercase tracking-[0.2em] text-[10px] font-mono">02. Neural Segmentation</span>
            <p className="leading-relaxed">
              Runs 100% in-browser using WebAssembly and ONNX models. Your images never leave your machine — completely private and secure.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-white/50 uppercase tracking-[0.2em] text-[10px] font-mono">03. Copy or Download</span>
            <p className="leading-relaxed">
              Pressing <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[9px] text-white/60">Ctrl+C</kbd> copies the background-free PNG directly back into your clipboard to paste in slack/docs.
            </p>
          </div>
        </footer>

      </div>
    </main>
  );
}
