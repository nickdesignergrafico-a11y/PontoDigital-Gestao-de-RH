import { useState, useEffect, useRef } from 'react';
import { Maximize2, X, RotateCw, Check, Smartphone, Trash2, PenTool, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  initialValue?: string;
  operatorName?: string;
  profileSignatureUrl?: string;
}

export function SignaturePad({
  label,
  onSave,
  onClear,
  initialValue,
  operatorName,
  profileSignatureUrl
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(true);
  const [hasSignature, setHasSignature] = useState(Boolean(initialValue));
  const lastSavedUrlRef = useRef<string>(initialValue || '');

  // Track screen orientation for portrait/landscape detection on mobile
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Helper to draw an image dataURL onto a canvas cleanly
  const drawDataUrlOnCanvas = (canvas: HTMLCanvasElement | null, dataUrl: string) => {
    if (!canvas || !dataUrl) return;
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.max(Math.floor(rect.width), 240);
    const targetH = Math.max(Math.floor(rect.height), 120);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  };

  // Sync state if initialValue changes externally
  useEffect(() => {
    if (initialValue) {
      setHasSignature(true);
      if (initialValue !== lastSavedUrlRef.current) {
        lastSavedUrlRef.current = initialValue;
        drawDataUrlOnCanvas(canvasRef.current, initialValue);
      }
    } else if (initialValue === '' && lastSavedUrlRef.current !== '') {
      lastSavedUrlRef.current = '';
      setHasSignature(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [initialValue]);

  // Hook up canvas sizing with integer dimensions so ResizeObserver never wipes strokes
  const setupCanvas = (
    canvas: HTMLCanvasElement | null,
    val: string | undefined
  ) => {
    if (!canvas) return;

    const initAndResize = (forceDrawInitial = false) => {
      const rect = canvas.getBoundingClientRect();
      const currentWidth = Math.max(Math.floor(rect.width), 240);
      const currentHeight = Math.max(Math.floor(rect.height), 120);

      const dimensionsChanged = Math.abs(canvas.width - currentWidth) > 2 || Math.abs(canvas.height - currentHeight) > 2;

      if (dimensionsChanged) {
        const sourceToRestore = lastSavedUrlRef.current || val || '';
        canvas.width = currentWidth;
        canvas.height = currentHeight;

        const newCtx = canvas.getContext('2d');
        if (newCtx) {
          newCtx.lineWidth = 3;
          newCtx.strokeStyle = '#0f172a';
          newCtx.lineCap = 'round';
          newCtx.lineJoin = 'round';

          if (sourceToRestore) {
            const img = new Image();
            img.onload = () => {
              newCtx.clearRect(0, 0, currentWidth, currentHeight);
              newCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
            };
            img.src = sourceToRestore;
          }
        }
      } else if (forceDrawInitial && (lastSavedUrlRef.current || val)) {
        const sourceToDraw = lastSavedUrlRef.current || val || '';
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0f172a';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = sourceToDraw;
        }
      } else {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0f172a';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    };

    initAndResize(true);

    const resizeObserver = new ResizeObserver(() => {
      initAndResize(false);
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  };

  // Inline Canvas Setup (only depends on isModalOpen so drawing doesn't reset observer)
  useEffect(() => {
    if (!isModalOpen) {
      return setupCanvas(canvasRef.current, lastSavedUrlRef.current || initialValue);
    }
  }, [isModalOpen]);

  // Modal Canvas Setup
  useEffect(() => {
    if (isModalOpen) {
      return setupCanvas(modalCanvasRef.current, lastSavedUrlRef.current || initialValue);
    }
  }, [isModalOpen]);

  const getPos = (canvas: HTMLCanvasElement, e: any) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const commitCanvasSignature = (canvas: HTMLCanvasElement) => {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl && dataUrl !== 'data:,') {
        lastSavedUrlRef.current = dataUrl;
        setHasSignature(true);
        onSave(dataUrl);
      }
    } catch (err) {
      console.error('Erro ao capturar assinatura no canvas:', err);
    }
  };

  const startDrawing = (canvas: HTMLCanvasElement, e: any) => {
    if (e.cancelable) e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pos = getPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    // Also draw a tiny dot in case the user taps
    ctx.lineTo(pos.x + 0.5, pos.y + 0.5);
    ctx.stroke();
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (canvas: HTMLCanvasElement, e: any) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = (canvas: HTMLCanvasElement) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    commitCanvasSignature(canvas);
  };

  const handleClear = (canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (canvasRef.current) {
      const ctx2 = canvasRef.current.getContext('2d');
      ctx2?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    lastSavedUrlRef.current = '';
    setHasSignature(false);
    onClear();
  };

  const handleGenerateCursiveSignature = () => {
    const cleanName = (operatorName || '').trim();
    const textToSign = cleanName && !cleanName.toLowerCase().includes('plantão anterior') && !cleanName.toLowerCase().includes('a definir')
      ? cleanName
      : 'Visto Confirmado';

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 500;
    tempCanvas.height = 150;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'italic bold 38px "Caveat", "Dancing Script", "Brush Script MT", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    ctx.rotate(-0.04);
    ctx.fillText(textToSign, 0, 0);
    // Subtle underline flourish
    ctx.beginPath();
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2;
    const textWidth = Math.min(ctx.measureText(textToSign).width, 380);
    ctx.moveTo(-textWidth / 2, 22);
    ctx.quadraticCurveTo(0, 14, textWidth / 2, 24);
    ctx.stroke();
    ctx.restore();

    const dataUrl = tempCanvas.toDataURL('image/png');
    lastSavedUrlRef.current = dataUrl;
    setHasSignature(true);
    drawDataUrlOnCanvas(canvasRef.current, dataUrl);
    if (isModalOpen) {
      drawDataUrlOnCanvas(modalCanvasRef.current, dataUrl);
    }
    onSave(dataUrl);
  };

  const handleUseProfileSignature = () => {
    if (!profileSignatureUrl) return;
    lastSavedUrlRef.current = profileSignatureUrl;
    setHasSignature(true);
    drawDataUrlOnCanvas(canvasRef.current, profileSignatureUrl);
    if (isModalOpen) {
      drawDataUrlOnCanvas(modalCanvasRef.current, profileSignatureUrl);
    }
    onSave(profileSignatureUrl);
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (modalCanvasRef.current && hasSignature) {
      const dataUrl = modalCanvasRef.current.toDataURL('image/png');
      if (dataUrl && dataUrl !== 'data:,') {
        lastSavedUrlRef.current = dataUrl;
        onSave(dataUrl);
      }
    }
    setIsModalOpen(false);
  };

  const handleConfirmModalSignature = () => {
    const modalCanvas = modalCanvasRef.current;
    if (modalCanvas) {
      const dataUrl = modalCanvas.toDataURL('image/png');
      lastSavedUrlRef.current = dataUrl;
      drawDataUrlOnCanvas(canvasRef.current, dataUrl);
      onSave(dataUrl);
      setHasSignature(true);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex flex-wrap justify-between items-center gap-1">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-slate-600 uppercase">{label}</label>
          {hasSignature && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
              Registrada
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {profileSignatureUrl && (
            <button
              type="button"
              onClick={handleUseProfileSignature}
              className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
              title="Inserir assinatura salva no perfil deste colaborador"
            >
              <Check className="w-2.5 h-2.5" />
              Usar Perfil
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerateCursiveSignature}
            className="flex items-center gap-1 text-[10px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            title="Assinar com rubrica cursiva automática do nome informado"
          >
            <PenTool className="w-2.5 h-2.5" />
            Rubrica Digital
          </button>
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            Tela Cheia
          </button>
        </div>
      </div>

      <div className="border-2 border-dashed border-slate-300 bg-white rounded-xl relative overflow-hidden h-[154px] group">
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => startDrawing(canvasRef.current!, e)}
          onMouseMove={(e) => draw(canvasRef.current!, e)}
          onMouseUp={() => stopDrawing(canvasRef.current!)}
          onMouseLeave={() => stopDrawing(canvasRef.current!)}
          onTouchStart={(e) => startDrawing(canvasRef.current!, e)}
          onTouchMove={(e) => draw(canvasRef.current!, e)}
          onTouchEnd={() => stopDrawing(canvasRef.current!)}
          onTouchCancel={() => stopDrawing(canvasRef.current!)}
          className="w-full h-[150px] cursor-crosshair touch-none block bg-transparent"
        />

        {!hasSignature && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300 select-none">
            <span className="font-serif italic text-base font-bold opacity-60">
              Desenhe a assinatura aqui ou clique em "Rubrica Digital"
            </span>
          </div>
        )}
        
        <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-85 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => handleClear(canvasRef.current)}
            className="bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-bold uppercase py-1 px-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-2.5 h-2.5" />
            Limpar
          </button>
        </div>
      </div>

      {/* FULL SCREEN / ROTATION SIGNATURE MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/95 p-4 md:p-6 justify-between select-none">
            {/* Modal Header */}
            <div className="flex items-center justify-between text-white pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-indigo-400">
                  Assinatura Digital - {label}
                </h3>
                <p className="text-xs text-slate-400">
                  Desenhe sua assinatura no espaço em branco abaixo ou use a Rubrica Digital.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Auto-Rotation Instruction Helper */}
            {isPortrait && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-950/80 border border-indigo-800 text-indigo-200 text-xs p-3 rounded-xl flex items-center gap-3 my-2"
              >
                <div className="p-2 bg-indigo-900/60 rounded-lg animate-bounce">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="font-black block uppercase text-[10px] text-indigo-400 tracking-wider">Passo Recomendado</span>
                  Vire o seu celular de lado (na horizontal/deitado) para ter muito mais espaço e facilidade ao assinar!
                </div>
                <RotateCw className="w-4 h-4 text-indigo-400 animate-spin-slow hidden sm:block" />
              </motion.div>
            )}

            {/* Huge Canvas Area */}
            <div className="flex-1 bg-white rounded-2xl border-2 border-indigo-500 shadow-2xl relative my-3 overflow-hidden flex flex-col justify-end">
              <canvas
                ref={modalCanvasRef}
                onMouseDown={(e) => startDrawing(modalCanvasRef.current!, e)}
                onMouseMove={(e) => draw(modalCanvasRef.current!, e)}
                onMouseUp={() => stopDrawing(modalCanvasRef.current!)}
                onMouseLeave={() => stopDrawing(modalCanvasRef.current!)}
                onTouchStart={(e) => startDrawing(modalCanvasRef.current!, e)}
                onTouchMove={(e) => draw(modalCanvasRef.current!, e)}
                onTouchEnd={() => stopDrawing(modalCanvasRef.current!)}
                onTouchCancel={() => stopDrawing(modalCanvasRef.current!)}
                className="absolute inset-0 w-full h-full cursor-crosshair touch-none bg-transparent"
              />
              
              {/* Overlay watermarks */}
              {!hasSignature && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300">
                  <span className="font-serif italic text-2xl tracking-widest font-black opacity-30 select-none">
                    Assine Aqui
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-30 select-none">
                    Área Digital de Homologação
                  </span>
                </div>
              )}

              {/* Clear & Cursive buttons inside the signature area */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateCursiveSignature}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-black uppercase py-2 px-3.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm border border-blue-200"
                >
                  <PenTool className="w-3.5 h-3.5 text-blue-600" />
                  Gerar Rubrica Cursiva
                </button>
                <button
                  type="button"
                  onClick={() => handleClear(modalCanvasRef.current)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase py-2 px-3.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm border border-slate-200"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                  Limpar Campo
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmModalSignature}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Check className="w-4 h-4" />
                Confirmar Assinatura
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
