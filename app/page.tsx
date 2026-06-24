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

export interface QueueItem {
  id: string;
  originalFile: File;
  originalUrl: string;
  originalDimensions: { width: number; height: number } | null;
  processedBlob: Blob | null;
  processedUrl: string | null;
  processedDimensions: { width: number; height: number } | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  progressKey: string;
  accuracyMode: 'isnet' | 'isnet_quint8';
}

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

  // Batch Queue State
  const [activeView, setActiveView] = useState<'single' | 'batch'>('single');
  const [batchQueue, setBatchQueue] = useState<QueueItem[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const batchQueueRef = useRef<QueueItem[]>([]);

  // Keep ref in sync
  useEffect(() => {
    batchQueueRef.current = batchQueue;
  }, [batchQueue]);

  // Clean up Object URLs for batch queue on unmount
  useEffect(() => {
    return () => {
      batchQueueRef.current.forEach(item => {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
      });
    };
  }, []);

  // Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

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
  }, [originalUrl, processedUrl, showToast]);

  // Add files to Batch Queue
  const addFilesToBatchQueue = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        showToast(`Skipped non-image file: ${file.name}`, 'error');
        continue;
      }
      const id = Math.random().toString(36).substring(2, 11);
      const originalUrl = URL.createObjectURL(file);
      
      const newItem: QueueItem = {
        id,
        originalFile: file,
        originalUrl,
        originalDimensions: null,
        processedBlob: null,
        processedUrl: null,
        processedDimensions: null,
        status: 'pending',
        progress: 0,
        progressKey: 'Waiting in queue...',
        accuracyMode: accuracyMode
      };

      // Load original dimensions asynchronously
      const img = new Image();
      img.onload = () => {
        setBatchQueue(prev => prev.map(item => item.id === id ? {
          ...item,
          originalDimensions: { width: img.naturalWidth, height: img.naturalHeight }
        } : item));
      };
      img.src = originalUrl;

      newItems.push(newItem);
    }

    if (newItems.length > 0) {
      setBatchQueue(prev => [...prev, ...newItems]);
      setSelectedQueueId(prev => prev || newItems[0].id);
      showToast(`Added ${newItems.length} image(s) to the batch queue!`, 'success');
    }
  }, [accuracyMode, showToast]);

  // Remove single item from Batch Queue
  const removeQueueItem = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setBatchQueue(prev => {
      const item = prev.find(item => item.id === id);
      if (item) {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
      }
      const updated = prev.filter(item => item.id !== id);
      
      // Adjust selectedQueueId if deleted item was currently selected
      if (selectedQueueId === id) {
        if (updated.length > 0) {
          setSelectedQueueId(updated[0].id);
        } else {
          setSelectedQueueId(null);
        }
      }
      return updated;
    });
    showToast('Removed item from batch queue.', 'info');
  }, [selectedQueueId, showToast]);

  // Clear all items from Batch Queue
  const clearBatchQueue = useCallback(() => {
    batchQueueRef.current.forEach(item => {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
    });
    setBatchQueue([]);
    setSelectedQueueId(null);
    showToast('Cleared all items from batch queue.', 'info');
  }, [showToast]);

  // Process a single Batch Queue Item
  const processQueueItem = useCallback(async (id: string) => {
    setBatchQueue(prev => prev.map(item => item.id === id ? {
      ...item,
      status: 'processing' as const,
      progress: 0,
      progressKey: 'Initializing...'
    } : item));

    try {
      const { removeBackground } = await import('@imgly/background-removal');
      
      const itemToProcess = batchQueueRef.current.find(item => item.id === id);
      if (!itemToProcess) return;

      const resultBlob = await removeBackground(itemToProcess.originalFile, {
        model: itemToProcess.accuracyMode,
        progress: (key: string, current: number, total: number) => {
          let phase = 'Processing...';
          if (key.includes('fetch')) {
            phase = 'Downloading AI model...';
          } else if (key.includes('onnx')) {
            phase = 'Initializing...';
          } else if (key.includes('compute')) {
            phase = 'Segmenting pixels...';
          }
          
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          
          setBatchQueue(prev => prev.map(item => item.id === id ? {
            ...item,
            progress: pct,
            progressKey: `${phase} (${pct}%)`
          } : item));
        }
      });

      const resultUrl = URL.createObjectURL(resultBlob);

      const img = new Image();
      img.onload = () => {
        setBatchQueue(prev => prev.map(item => item.id === id ? {
          ...item,
          status: 'completed' as const,
          processedBlob: resultBlob,
          processedUrl: resultUrl,
          processedDimensions: { width: img.naturalWidth, height: img.naturalHeight },
          progress: 100,
          progressKey: 'Ready'
        } : item));
        showToast(`Completed: ${itemToProcess.originalFile.name}`, 'success');
      };
      img.src = resultUrl;

    } catch (err: any) {
      console.error(`Failed to process batch item ${id}:`, err);
      setBatchQueue(prev => prev.map(item => item.id === id ? {
        ...item,
        status: 'failed' as const,
        progressKey: `Error: ${err.message || 'Failed'}`
      } : item));
      showToast(`Failed: ${err.message || 'Processing error'}`, 'error');
    }
  }, [showToast]);

  // Queue background processor
  useEffect(() => {
    const hasProcessing = batchQueue.some(item => item.status === 'processing');
    if (hasProcessing) return;

    const nextPending = batchQueue.find(item => item.status === 'pending');
    if (nextPending) {
      processQueueItem(nextPending.id);
    }
  }, [batchQueue, processQueueItem]);

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (activeView === 'batch') {
        addFilesToBatchQueue(e.dataTransfer.files);
      } else {
        processInputFile(e.dataTransfer.files[0]);
      }
    }
  };

  // Handle file select click
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (activeView === 'batch') {
        addFilesToBatchQueue(e.target.files);
      } else {
        processInputFile(e.target.files[0]);
      }
    }
  };

  // Listen to Paste events (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        if (activeView === 'batch') {
          addFilesToBatchQueue(pastedFiles);
        } else {
          processInputFile(pastedFiles[0]);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeView, processInputFile, addFilesToBatchQueue]);

  // Core Background Removal Handler
  const handleRemoveBackground = useCallback(async (modeOverride?: 'isnet' | 'isnet_quint8') => {
    if (!originalFile) return;

    const selectedMode = modeOverride || accuracyMode;

    try {
      setIsProcessing(true);
      setProgress(0);
      setProgressKey('Loading model config...');

      // Dynamic load @imgly/background-removal on client only
      const { removeBackground } = await import('@imgly/background-removal');

      const resultBlob = await removeBackground(originalFile, {
        model: selectedMode,
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
  }, [originalFile, accuracyMode, processedUrl, showToast]);

  // Helper to draw background color behind the image and export/copy
  const getOutputBlobWithBg = useCallback(async (blobOverride?: Blob, urlOverride?: string): Promise<Blob> => {
    const targetBlob = blobOverride || processedBlob;
    const targetUrl = urlOverride || processedUrl;

    if (!targetBlob || !targetUrl) {
      throw new Error('No image loaded');
    }

    if (selectedBg === 'transparent') {
      return targetBlob;
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
      img.src = targetUrl;
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
  }, [processedBlob, getOutputBlobWithBg, showToast]);

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

  // Copy PNG Handler for Batch Item
  const handleCopyBatchItem = useCallback(async (item: QueueItem) => {
    if (!item.processedBlob || !item.processedUrl) return;

    try {
      const blobToCopy = await getOutputBlobWithBg(item.processedBlob, item.processedUrl);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blobToCopy
        })
      ]);

      showToast('PNG copied to clipboard!', 'success');
    } catch (err) {
      console.error('Failed to copy batch image:', err);
      showToast('Direct copying is restricted in this browser context. Please download.', 'error');
    }
  }, [getOutputBlobWithBg, showToast]);

  // Download Handler for Batch Item
  const handleDownloadBatchItem = useCallback(async (item: QueueItem) => {
    if (!item.processedBlob || !item.processedUrl) return;

    try {
      const blobToDownload = await getOutputBlobWithBg(item.processedBlob, item.processedUrl);
      const exportUrl = URL.createObjectURL(blobToDownload);

      const a = document.createElement('a');
      const baseName = item.originalFile.name.substring(0, item.originalFile.name.lastIndexOf('.')) || 'nobg';
      a.href = exportUrl;
      a.download = `${baseName}_nobg.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(exportUrl), 100);
      showToast('Image downloaded successfully!', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      const a = document.createElement('a');
      a.href = item.processedUrl;
      const baseName = item.originalFile.name.substring(0, item.originalFile.name.lastIndexOf('.')) || 'nobg';
      a.download = `${baseName}_nobg.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Downloaded transparent PNG.', 'info');
    }
  }, [getOutputBlobWithBg, showToast]);

  // Reset Everything
  const handleClear = useCallback(() => {
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
  }, [originalUrl, processedUrl, showToast]);

  // Bind keyboard shortcuts: Ctrl + C to copy processed image, Enter to trigger background removal, Tab to cycle modes, Delete to clear workspace/queue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true');

      // Bind Ctrl + C to copy processed image
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (isInput) {
          return;
        }

        if (activeView === 'single' && processedBlob) {
          e.preventDefault();
          handleCopy();
        } else if (activeView === 'batch' && selectedQueueId) {
          const selectedItem = batchQueueRef.current.find(item => item.id === selectedQueueId);
          if (selectedItem && selectedItem.processedBlob) {
            e.preventDefault();
            handleCopyBatchItem(selectedItem);
          }
        }
      }

      // Bind Enter to trigger background removal (or regenerate with ultra mode if already processed)
      if (e.key === 'Enter') {
        if (isInput || (active && active.tagName === 'BUTTON')) {
          return;
        }

        if (activeView === 'single') {
          if (originalFile && !isProcessing) {
            e.preventDefault();
            if (processedUrl) {
              setAccuracyMode('isnet');
              handleRemoveBackground('isnet');
            } else {
              handleRemoveBackground();
            }
          }
        } else if (activeView === 'batch' && selectedQueueId) {
          const selectedItem = batchQueueRef.current.find(item => item.id === selectedQueueId);
          if (selectedItem && selectedItem.status !== 'processing') {
            e.preventDefault();
            setBatchQueue(prev => prev.map(item => item.id === selectedQueueId ? {
              ...item,
              status: 'pending' as const,
              accuracyMode: 'isnet' as const,
              progress: 0,
              progressKey: 'Waiting in queue...'
            } : item));
            showToast('Re-queued item in Ultra Accurate mode.', 'info');
          }
        }
      }

      // Bind Tab to cycle between accuracy modes
      if (e.key === 'Tab') {
        if (isInput) {
          return;
        }
        e.preventDefault();
        setAccuracyMode((prev) => {
          const next = prev === 'isnet' ? 'isnet_quint8' : 'isnet';
          showToast(
            next === 'isnet'
               ? 'Switched to Ultra Accurate mode (U2Net Full Model)'
               : 'Switched to Standard mode (Fast Quantized)',
            'info'
          );
          return next;
        });
      }

      // Bind Delete to clear workspace (single) or clear batch queue (batch)
      if (e.key === 'Delete') {
        if (isInput) {
          return;
        }
        e.preventDefault();
        if (activeView === 'single') {
          handleClear();
        } else if (activeView === 'batch') {
          clearBatchQueue();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeView,
    processedBlob,
    processedUrl,
    handleCopy,
    originalFile,
    isProcessing,
    handleRemoveBackground,
    selectedQueueId,
    handleCopyBatchItem,
    showToast,
    handleClear,
    clearBatchQueue
  ]);

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
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-white flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                </div>
                <span className="font-serif italic text-xl tracking-tight text-white select-none">PureMask.</span>
                <span className="text-[10px] uppercase tracking-widest font-mono bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-semibold">
                  Local AI
                </span>
              </div>

              {/* View Switcher Pills */}
              <div className="flex bg-white/5 p-1 rounded-full border border-white/5 ml-2">
                <button
                  onClick={() => setActiveView('single')}
                  className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-semibold transition-all duration-200 cursor-pointer ${
                    activeView === 'single'
                      ? 'bg-white text-black shadow-md font-bold'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  Single Image
                </button>
                <button
                  onClick={() => setActiveView('batch')}
                  className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-semibold transition-all duration-200 relative cursor-pointer ${
                    activeView === 'batch'
                      ? 'bg-white text-black shadow-md font-bold'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  Batch Queue
                  {batchQueue.filter(item => item.status === 'pending' || item.status === 'processing').length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                </button>
              </div>

              {/* Elegant Shortcut indicators */}
              <div className="hidden lg:flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-white/30 font-mono ml-2 border-l border-white/10 pl-4 select-none">
                <div className="flex items-center gap-1">
                  <span>Ctrl+V</span> <span className="text-white/20 ml-0.5">Paste</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Tab</span> <span className="text-white/20 ml-0.5">Switch</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Enter</span> <span className="text-white/20 ml-0.5">{processedUrl ? 'Regen (Ultra)' : 'Start'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Ctrl+C</span> <span className="text-white/20 ml-0.5">Copy</span>
                </div>
              </div>
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
            
            {activeView === 'single' ? (
              !originalUrl ? (
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
              )
            ) : (
              // --- BATCH QUEUE VIEW ---
              batchQueue.length === 0 ? (
                <motion.div
                  key="batch-upload-zone"
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
                  <div className="absolute inset-0 checkerboard opacity-20 pointer-events-none"></div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />

                  <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm">
                    <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center bg-black/40 text-white/60 group-hover:scale-105 transition-transform duration-300">
                      <Layers className="w-8 h-8 text-white/50" />
                    </div>
                    
                    <div className="space-y-2">
                      <h2 className="text-2xl font-serif italic text-white font-medium">Ready for Batch Queue</h2>
                      <p className="text-sm text-white/40 tracking-wide leading-relaxed">
                        Paste images repeatedly (<kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[10px] text-white/60">Ctrl+V</kbd>), drag & drop multiple files, or browse.
                      </p>
                    </div>

                    <button className="px-8 py-3 rounded-full glass text-xs uppercase tracking-[0.2em] hover:bg-white/10 transition-all duration-200">
                      Select Files
                    </button>

                    <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-[0.2em] font-mono mt-4">
                      <span>Processes items in a sequential local queue</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="batch-active-workspace"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch"
                >
                  {/* Left Queue Panel: 1/3 width */}
                  <div className="col-span-1 md:col-span-4 flex flex-col glass rounded-3xl overflow-hidden border border-white/15">
                    {/* Queue Header */}
                    <div className="px-4 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50 flex items-center gap-1.5 font-mono">
                        <Layers className="w-3.5 h-3.5 text-white/40" /> Queue ({batchQueue.length})
                      </span>
                      <button
                        onClick={clearBatchQueue}
                        className="text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 p-1.5 rounded-full"
                        title="Clear batch queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Queue List */}
                    <div className="flex-1 overflow-y-auto max-h-[500px] divide-y divide-white/5 p-2 space-y-1.5">
                      {batchQueue.map((item) => {
                        const isSelected = selectedQueueId === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedQueueId(item.id)}
                            className={`group/item flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-white/10 border border-white/20'
                                : 'bg-white/[0.02] hover:bg-white/[0.05] border border-transparent'
                            }`}
                          >
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/5 bg-black/40 flex-shrink-0 relative">
                              <img
                                src={item.originalUrl}
                                alt="Thumbnail"
                                className="w-full h-full object-cover"
                              />
                              {item.status === 'processing' && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white/80 truncate group-hover/item:text-white transition-colors">
                                {item.originalFile.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                                  item.accuracyMode === 'isnet' 
                                    ? 'bg-emerald-500/15 text-emerald-400' 
                                    : 'bg-zinc-500/15 text-zinc-400'
                                }`}>
                                  {item.accuracyMode === 'isnet' ? 'Ultra' : 'Std'}
                                </span>
                                
                                {item.status === 'completed' && (
                                  <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono uppercase">
                                    <Check className="w-2.5 h-2.5" /> Ready
                                  </span>
                                )}
                                {item.status === 'pending' && (
                                  <span className="text-[9px] text-white/40 flex items-center gap-1 font-mono uppercase animate-pulse">
                                    Waiting...
                                  </span>
                                )}
                                {item.status === 'processing' && (
                                  <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono uppercase">
                                    Active ({item.progress}%)
                                  </span>
                                )}
                                {item.status === 'failed' && (
                                  <span className="text-[9px] text-rose-400 flex items-center gap-1 font-mono uppercase">
                                    Failed
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={(e) => removeQueueItem(item.id, e)}
                              className="opacity-0 group-hover/item:opacity-100 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 p-1 rounded-full transition-all duration-150"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-3 border-t border-white/5 bg-white/[0.01] text-[10px] text-white/30 font-mono flex items-center gap-1.5 justify-center">
                      <kbd className="px-1 py-0.2 bg-white/5 border border-white/10 rounded font-mono text-[9px] text-white/40">Ctrl+V</kbd> to paste more files
                    </div>
                  </div>

                  {/* Right Workspace Detail Panel: 2/3 width */}
                  <div className="col-span-1 md:col-span-8 flex flex-col glass rounded-3xl overflow-hidden border border-white/15">
                    {(() => {
                      const selectedItem = batchQueue.find(item => item.id === selectedQueueId);
                      if (!selectedItem) {
                        return (
                          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white/30">
                            <Layers className="w-10 h-10 mb-3 text-white/10 animate-pulse" />
                            <p className="text-sm">Select an item from the queue to view its results.</p>
                          </div>
                        );
                      }

                      return (
                        <>
                          {/* Selected Item Header */}
                          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">CURRENT SELECTED ITEM</span>
                              <span className="text-xs font-semibold text-white/85 truncate max-w-[280px] md:max-w-[400px]">{selectedItem.originalFile.name}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {selectedItem.status === 'completed' && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                                  <Check className="w-3 h-3" /> Processed
                                </span>
                              )}
                              {selectedItem.status === 'processing' && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 font-mono animate-pulse">
                                  Segmenting...
                                </span>
                              )}
                              {selectedItem.status === 'pending' && (
                                <span className="text-[10px] text-white/40 bg-white/5 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                                  Waiting
                                </span>
                              )}
                              {selectedItem.status === 'failed' && (
                                <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                                  Failed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Selected Item Body */}
                          <div className="flex-1 p-6 flex flex-col justify-center bg-black/20 relative min-h-[300px]">
                            {selectedItem.status === 'completed' && selectedItem.processedUrl ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                <div className="flex flex-col items-center gap-2">
                                  <span className="text-[10px] uppercase font-mono tracking-wider text-white/30">ORIGINAL</span>
                                  <div className="w-full max-h-[180px] md:max-h-[220px] bg-black/40 border border-white/5 rounded-xl overflow-hidden flex items-center justify-center p-3 relative">
                                    <div className="absolute inset-0 checkerboard opacity-5 pointer-events-none"></div>
                                    <img
                                      src={selectedItem.originalUrl}
                                      alt="Original"
                                      className="max-w-full max-h-[160px] md:max-h-[200px] object-contain rounded-lg border border-white/5"
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-col items-center gap-2">
                                  <span className="text-[10px] uppercase font-mono tracking-wider text-white/30">PROCESSED</span>
                                  <div 
                                    className="w-full max-h-[180px] md:max-h-[220px] border border-white/5 rounded-xl overflow-hidden flex items-center justify-center p-3 relative"
                                    style={{
                                      backgroundColor: selectedBg === 'transparent' ? 'transparent' : selectedBg,
                                    }}
                                  >
                                    {selectedBg === 'transparent' && (
                                      <div className="absolute inset-0 checkerboard opacity-40"></div>
                                    )}
                                    <img
                                      src={selectedItem.processedUrl}
                                      alt="Processed Output"
                                      className="max-w-full max-h-[160px] md:max-h-[200px] object-contain select-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : selectedItem.status === 'processing' ? (
                              <div className="w-full max-w-xs mx-auto flex flex-col gap-5 items-center">
                                <div className="relative">
                                  <div className="w-14 h-14 border-2 border-white/10 border-t-white rounded-full animate-spin"></div>
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-mono font-bold text-white">
                                    {selectedItem.progress}%
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1 w-full text-center">
                                  <p className="font-serif italic text-white text-lg truncate max-w-[280px]">{selectedItem.progressKey}</p>
                                  <p className="text-[10px] text-white/30 font-mono uppercase tracking-[0.2em]">SEGMENTATION ENGINE ACTIVE</p>
                                </div>

                                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden border border-white/5">
                                  <div 
                                    className="bg-white h-full transition-all duration-100"
                                    style={{ width: `${selectedItem.progress}%` }}
                                  />
                                </div>
                              </div>
                            ) : selectedItem.status === 'pending' ? (
                              <div className="flex flex-col items-center justify-center gap-4 text-center p-6 w-full max-w-sm mx-auto">
                                <div className="w-12 h-12 rounded-full border border-white/5 bg-black/40 flex items-center justify-center text-white/20">
                                  <RefreshCw className="w-5 h-5 animate-spin" />
                                </div>
                                <div className="space-y-1">
                                  <h3 className="font-serif italic text-white text-lg">Waiting in Queue</h3>
                                  <p className="text-xs text-white/40 leading-relaxed max-w-[240px] mx-auto">
                                    This file is pending processing. It will automatically run when active conversions complete.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-4 text-center p-6 w-full max-w-sm mx-auto">
                                <div className="w-12 h-12 rounded-full border border-red-500/10 bg-red-500/5 flex items-center justify-center text-rose-400">
                                  <XCircle className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <h3 className="font-serif italic text-white text-lg">Processing Failed</h3>
                                  <p className="text-xs text-rose-400/80 leading-relaxed max-w-[240px] mx-auto">
                                    {selectedItem.progressKey || 'Neural network failed to initialize or execute.'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setBatchQueue(prev => prev.map(item => item.id === selectedItem.id ? {
                                      ...item,
                                      status: 'pending' as const,
                                      progress: 0,
                                      progressKey: 'Retrying...'
                                    } : item));
                                  }}
                                  className="mt-2 border border-white/10 hover:border-white/20 text-white text-xs px-4 py-2 rounded-full font-semibold bg-white/5 hover:bg-white/10 cursor-pointer"
                                >
                                  Retry Processing
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Presets Background Bar (Only when processed) */}
                          {selectedItem.status === 'completed' && selectedItem.processedUrl && (
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

                          {/* Selected Item Metadata Bar (Only when processed) */}
                          {selectedItem.status === 'completed' && (
                            <div className="px-5 py-3 border-t border-white/5 text-[11px] text-white/40 font-mono bg-white/[0.01] flex flex-wrap gap-x-4 gap-y-1 justify-between items-center">
                              <div>
                                FORMAT: <span className="font-semibold text-white/75">PNG (LOSSLESS)</span>
                              </div>
                              {selectedItem.processedDimensions && (
                                <div>
                                  SIZE: <span className="font-semibold text-white/75">{selectedItem.processedDimensions.width} × {selectedItem.processedDimensions.height} PX</span>
                                </div>
                              )}
                              {selectedItem.processedBlob && (
                                <div>
                                  WEIGHT: <span className="font-semibold text-white/75">{formatFileSize(selectedItem.processedBlob.size)}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Selected Item Actions Footer (Only when processed) */}
                          {selectedItem.status === 'completed' && (
                            <div className="px-5 py-4 border-t border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
                              <div>
                                {selectedItem.accuracyMode !== 'isnet' && (
                                  <button
                                    onClick={() => {
                                      setBatchQueue(prev => prev.map(item => item.id === selectedItem.id ? {
                                        ...item,
                                        status: 'pending' as const,
                                        accuracyMode: 'isnet' as const,
                                        progress: 0,
                                        progressKey: 'Waiting in queue...'
                                      } : item));
                                      showToast('Re-queued item in Ultra Accurate mode.', 'info');
                                    }}
                                    className="border border-white/10 hover:border-white/20 text-white font-semibold text-xs px-4 py-2 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 hover:bg-white/5 cursor-pointer"
                                    title="Re-queue and regenerate in ultra mode"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Regenerate in Ultra</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleCopyBatchItem(selectedItem)}
                                  className="glass text-white font-semibold text-xs px-4 py-2 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 hover:bg-white/10 cursor-pointer"
                                  title="Copy image to clipboard"
                                >
                                  <Copy className="w-3.5 h-3.5 text-white/70" />
                                  <span>Copy Result</span>
                                </button>

                                <button
                                  onClick={() => handleDownloadBatchItem(selectedItem)}
                                  className="bg-white hover:bg-white/90 text-black font-semibold text-xs px-5 py-2 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 shadow-md cursor-pointer hover:scale-[1.01]"
                                  title="Download transparent PNG"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>

        {/* Action Controls Box */}
        {activeView === 'single' && originalUrl && (
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
                  onClick={() => handleRemoveBackground()}
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
                  {accuracyMode !== 'isnet' ? (
                    <button
                      id="btn-regen-ultra"
                      onClick={() => {
                        setAccuracyMode('isnet');
                        handleRemoveBackground('isnet');
                      }}
                      disabled={isProcessing}
                      className="flex-1 sm:flex-initial border border-white/10 hover:border-white/20 text-white font-semibold text-sm px-6 py-3 rounded-full flex items-center justify-center gap-2 transition-all duration-200 hover:bg-white/5 cursor-pointer disabled:opacity-50"
                      title="Switch to Ultra Accurate mode and regenerate"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Regenerate in Ultra</span>
                    </button>
                  ) : (
                    <button
                      id="btn-regen"
                      onClick={() => handleRemoveBackground('isnet')}
                      disabled={isProcessing}
                      className="flex-1 sm:flex-initial border border-white/10 hover:border-white/20 text-white/95 font-semibold text-sm px-6 py-3 rounded-full flex items-center justify-center gap-2 transition-all duration-200 hover:bg-white/5 cursor-pointer disabled:opacity-50"
                      title="Regenerate background removal"
                    >
                      <RefreshCw className="w-4 h-4 text-emerald-400" />
                      <span>Regenerate</span>
                    </button>
                  )}

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
