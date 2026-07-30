import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, Type as TypeIcon } from 'lucide-react';
import { TextOverlayConfig, TextOverlayLayer } from '../types';
import { FONT_OPTIONS, ensureFontLoaded } from '../utils/imageComposite';

interface TextOverlayEditorProps {
  imageUrl: string;
  config: TextOverlayConfig;
  onChange: (config: TextOverlayConfig) => void;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  brandFont?: string;
  className?: string;
}

const WEIGHT_OPTIONS = [400, 500, 600, 700, 800, 900];

let newLayerCounter = 0;
function makeLayerId(): string {
  newLayerCounter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `layer-${Date.now().toString(36)}-${newLayerCounter}`;
}

function createLayer(opts: { fontFamily?: string; color?: string }): TextOverlayLayer {
  return {
    id: makeLayerId(),
    text: 'New text',
    x: 0.5,
    y: 0.5,
    widthPct: 0.7,
    fontSize: 0.06,
    fontFamily: opts.fontFamily || 'Inter',
    fontWeight: 700,
    color: opts.color || '#ffffff',
    align: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.01,
    uppercase: false,
    shadow: true,
  };
}

// Same scrim gradients as utils/imageComposite.ts's applyScrim(), expressed as CSS so the
// preview matches the canvas composite.
function scrimGradient(scrim: TextOverlayConfig['scrim']): string | undefined {
  switch (scrim) {
    case 'bottom':
      return 'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 100%)';
    case 'top':
      return 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 55%)';
    case 'full':
      return 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.45) 100%)';
    default:
      return undefined;
  }
}

function horizontalTransform(align: TextOverlayLayer['align']): string {
  if (align === 'left') return 'translate(0%, -50%)';
  if (align === 'right') return 'translate(-100%, -50%)';
  return 'translate(-50%, -50%)';
}

const TextOverlayEditor: React.FC<TextOverlayEditorProps> = ({
  imageUrl,
  config,
  onChange,
  brandColors,
  brandFont,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(config.layers[0]?.id ?? null);

  const dragState = useRef<{ layerId: string; pointerId: number } | null>(null);

  // Keep a valid selection whenever layers change externally.
  useEffect(() => {
    if (!config.layers.some((l) => l.id === selectedLayerId)) {
      setSelectedLayerId(config.layers[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.layers]);

  // Measure the preview container so fractional fields can be converted to px,
  // using the exact same basis (container width/height in on-screen pixels)
  // that compositeOverlay() uses at natural image resolution.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageUrl]);

  const selectedLayer = useMemo(
    () => config.layers.find((l) => l.id === selectedLayerId) || null,
    [config.layers, selectedLayerId]
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<TextOverlayLayer>) => {
      onChange({
        ...config,
        layers: config.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      });
    },
    [config, onChange]
  );

  const addLayer = useCallback(() => {
    const layer = createLayer({ fontFamily: brandFont, color: brandColors?.primary });
    onChange({ ...config, layers: [...config.layers, layer] });
    setSelectedLayerId(layer.id);
    void ensureFontLoaded(layer.fontFamily, layer.fontWeight);
  }, [config, onChange, brandFont, brandColors]);

  const removeLayer = useCallback(
    (id: string) => {
      onChange({ ...config, layers: config.layers.filter((l) => l.id !== id) });
    },
    [config, onChange]
  );

  const setScrim = useCallback(
    (scrim: TextOverlayConfig['scrim']) => {
      onChange({ ...config, scrim });
    },
    [config, onChange]
  );

  // Preload the selected layer's font whenever it (or its weight) changes so
  // the preview renders real glyphs instead of a fallback font.
  useEffect(() => {
    if (selectedLayer) {
      void ensureFontLoaded(selectedLayer.fontFamily, selectedLayer.fontWeight);
    }
  }, [selectedLayer?.fontFamily, selectedLayer?.fontWeight]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, layerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedLayerId(layerId);
      dragState.current = { layerId, pointerId: e.pointerId };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragState.current;
      const el = containerRef.current;
      if (!drag || !el || drag.pointerId !== e.pointerId) return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      updateLayer(drag.layerId, { x, y });
    },
    [updateLayer]
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === e.pointerId) {
      dragState.current = null;
    }
  }, []);

  const swatches = [
    brandColors?.primary,
    brandColors?.secondary,
    brandColors?.accent,
    '#ffffff',
    '#000000',
  ].filter((c): c is string => !!c);

  const gradient = scrimGradient(config.scrim);

  return (
    <div className={`flex flex-col lg:flex-row gap-4 ${className}`}>
      {/* Preview */}
      <div className="flex-1 min-w-0">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img src={imageUrl} alt="Ad creative" className="block w-full h-auto pointer-events-none" draggable={false} />

          {gradient && (
            <div className="absolute inset-0 pointer-events-none" style={{ background: gradient }} />
          )}

          {containerSize.height > 0 &&
            config.layers.map((layer) => {
              const fontSizePx = layer.fontSize * containerSize.height;
              const isSelected = layer.id === selectedLayerId;
              const displayText = layer.uppercase ? layer.text.toUpperCase() : layer.text;

              return (
                <div
                  key={layer.id}
                  onPointerDown={(e) => handlePointerDown(e, layer.id)}
                  className={`absolute cursor-move touch-none ${isSelected ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-transparent' : ''}`}
                  style={{
                    left: `${layer.x * 100}%`,
                    top: `${layer.y * 100}%`,
                    width: `${layer.widthPct * 100}%`,
                    transform: horizontalTransform(layer.align),
                    textAlign: layer.align,
                    fontFamily: `"${layer.fontFamily}", sans-serif`,
                    fontWeight: layer.fontWeight,
                    fontSize: `${fontSizePx}px`,
                    lineHeight: layer.lineHeight,
                    letterSpacing: `${layer.letterSpacing * fontSizePx}px`,
                    color: layer.color,
                    textShadow: layer.shadow
                      ? `0 ${fontSizePx * 0.06}px ${fontSizePx * 0.25}px rgba(0,0,0,0.55)`
                      : undefined,
                    wordBreak: 'break-word',
                    padding: 2,
                  }}
                >
                  {displayText || <span className="opacity-40 italic">Empty layer</span>}
                </div>
              );
            })}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">Drag a text layer to reposition it. Click a layer to edit it below.</p>
      </div>

      {/* Controls */}
      <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
        {/* Layer list */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Text Layers</label>
            <button
              type="button"
              onClick={addLayer}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition"
            >
              <Plus size={12} /> Add text
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {config.layers.map((layer, i) => (
              <div
                key={layer.id}
                className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${
                  layer.id === selectedLayerId
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <TypeIcon size={11} />
                <span className="max-w-[7rem] truncate">{layer.text || `Layer ${i + 1}`}</span>
                {config.layers.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLayer(layer.id);
                    }}
                    className="p-0.5 rounded hover:bg-red-100 hover:text-red-600 transition"
                    title="Remove layer"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
            {config.layers.length === 0 && (
              <p className="text-xs text-slate-400">No text layers yet — add one to get started.</p>
            )}
          </div>
        </div>

        {selectedLayer && (
          <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
            {/* Text */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Text</label>
              <textarea
                value={selectedLayer.text}
                onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                rows={2}
                placeholder="Headline text..."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
            </div>

            {/* Font family + weight */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Font</label>
                <select
                  value={selectedLayer.fontFamily}
                  onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-500 transition"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Weight</label>
                <select
                  value={selectedLayer.fontWeight}
                  onChange={(e) => updateLayer(selectedLayer.id, { fontWeight: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-500 transition"
                >
                  {WEIGHT_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Size</label>
                <span className="text-[10px] text-slate-400">{Math.round(selectedLayer.fontSize * 1000) / 10}%</span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.2}
                step={0.005}
                value={selectedLayer.fontSize}
                onChange={(e) => updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Block width */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Block Width</label>
                <span className="text-[10px] text-slate-400">{Math.round(selectedLayer.widthPct * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.02}
                value={selectedLayer.widthPct}
                onChange={(e) => updateLayer(selectedLayer.id, { widthPct: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Alignment */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Alignment</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'left', icon: AlignLeft },
                  { value: 'center', icon: AlignCenter },
                  { value: 'right', icon: AlignRight },
                ] as const).map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { align: value })}
                    className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border text-xs font-bold transition ${
                      selectedLayer.align === value
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Color</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {swatches.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { color: c })}
                    title={c}
                    className={`w-6 h-6 rounded-full border-2 transition ${
                      selectedLayer.color.toLowerCase() === c.toLowerCase() ? 'border-emerald-500' : 'border-white'
                    } shadow ring-1 ring-slate-200`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(selectedLayer.color) ? selectedLayer.color : '#ffffff'}
                  onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                  className="w-6 h-6 rounded-full border-0 cursor-pointer bg-transparent p-0"
                  title="Custom color"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLayer.uppercase}
                  onChange={(e) => updateLayer(selectedLayer.id, { uppercase: e.target.checked })}
                  className="accent-emerald-500"
                />
                Uppercase
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLayer.shadow}
                  onChange={(e) => updateLayer(selectedLayer.id, { shadow: e.target.checked })}
                  className="accent-emerald-500"
                />
                Shadow
              </label>
            </div>
          </div>
        )}

        {/* Scrim */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Scrim</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['none', 'bottom', 'top', 'full'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScrim(s)}
                className={`py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition ${
                  (config.scrim || 'none') === s
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextOverlayEditor;
