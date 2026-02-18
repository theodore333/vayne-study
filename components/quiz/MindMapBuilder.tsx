'use client';

import { useState, useRef, useMemo } from 'react';
import { Plus, X, ArrowRight, Upload, Network, ChevronDown, ChevronRight, Loader2, Link2, GripVertical } from 'lucide-react';
import { resizeImage } from '@/lib/image-storage';

export interface MindMapBranch {
  id: string;
  text: string;
  children: Array<{ id: string; text: string }>;
}

export interface MindMapConnection {
  fromId: string;
  toId: string;
  label: string;
}

interface MindMapBuilderProps {
  central: string;
  setCentral: (text: string) => void;
  branches: MindMapBranch[];
  setBranches: (branches: MindMapBranch[]) => void;
  connections: MindMapConnection[];
  setConnections: (connections: MindMapConnection[]) => void;
  image: string | null;
  setImage: (image: string | null) => void;
  isEvaluating: boolean;
  onEvaluate: () => void;
  topicName: string;
}

// Color palette for branches (Tailwind classes must be static for compilation)
const BRANCH_COLORS = [
  { borderL: 'border-l-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-300', dot: 'bg-teal-400', pill: 'bg-teal-500/15 border-teal-500/25 text-teal-400', previewBg: 'bg-teal-500/20', previewBorder: 'border-teal-500/40', previewText: 'text-teal-300' },
  { borderL: 'border-l-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-300', dot: 'bg-violet-400', pill: 'bg-violet-500/15 border-violet-500/25 text-violet-400', previewBg: 'bg-violet-500/20', previewBorder: 'border-violet-500/40', previewText: 'text-violet-300' },
  { borderL: 'border-l-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-400', pill: 'bg-amber-500/15 border-amber-500/25 text-amber-400', previewBg: 'bg-amber-500/20', previewBorder: 'border-amber-500/40', previewText: 'text-amber-300' },
  { borderL: 'border-l-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', dot: 'bg-rose-400', pill: 'bg-rose-500/15 border-rose-500/25 text-rose-400', previewBg: 'bg-rose-500/20', previewBorder: 'border-rose-500/40', previewText: 'text-rose-300' },
  { borderL: 'border-l-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300', dot: 'bg-sky-400', pill: 'bg-sky-500/15 border-sky-500/25 text-sky-400', previewBg: 'bg-sky-500/20', previewBorder: 'border-sky-500/40', previewText: 'text-sky-300' },
  { borderL: 'border-l-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400', pill: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400', previewBg: 'bg-emerald-500/20', previewBorder: 'border-emerald-500/40', previewText: 'text-emerald-300' },
];

export function MindMapBuilder({
  central, setCentral,
  branches, setBranches,
  connections, setConnections,
  image, setImage,
  isEvaluating, onEvaluate, topicName
}: MindMapBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // Build node map for lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, { text: string; colorIdx: number }>();
    map.set('central', { text: central || topicName, colorIdx: -1 });
    branches.forEach((b, idx) => {
      if (b.text.trim()) map.set(b.id, { text: b.text, colorIdx: idx });
      b.children.forEach(c => {
        if (c.text.trim()) map.set(c.id, { text: c.text, colorIdx: idx });
      });
    });
    return map;
  }, [central, topicName, branches]);

  // All named nodes for connection picking
  const allNodes = useMemo(() =>
    Array.from(nodeMap.entries()).map(([id, info]) => ({ id, ...info })),
    [nodeMap]
  );

  // Connections grouped by node
  const connectionsForNode = useMemo(() => {
    const map = new Map<string, MindMapConnection[]>();
    for (const conn of connections) {
      if (!conn.fromId || !conn.toId) continue;
      if (!map.has(conn.fromId)) map.set(conn.fromId, []);
      if (!map.has(conn.toId)) map.set(conn.toId, []);
      map.get(conn.fromId)!.push(conn);
      map.get(conn.toId)!.push(conn);
    }
    return map;
  }, [connections]);

  const filledBranches = branches.filter(b => b.text.trim());
  const validConnections = connections.filter(c => c.fromId && c.toId && c.label.trim());

  // --- Event handlers ---
  const addBranch = () => {
    setBranches([...branches, { id: crypto.randomUUID(), text: '', children: [] }]);
  };
  const updateBranch = (id: string, text: string) => {
    setBranches(branches.map(b => b.id === id ? { ...b, text } : b));
  };
  const removeBranch = (id: string) => {
    setBranches(branches.filter(b => b.id !== id));
    setConnections(connections.filter(c => c.fromId !== id && c.toId !== id));
  };
  const addChild = (branchId: string) => {
    setBranches(branches.map(b =>
      b.id === branchId
        ? { ...b, children: [...b.children, { id: crypto.randomUUID(), text: '' }] }
        : b
    ));
  };
  const updateChild = (branchId: string, childId: string, text: string) => {
    setBranches(branches.map(b =>
      b.id === branchId
        ? { ...b, children: b.children.map(c => c.id === childId ? { ...c, text } : c) }
        : b
    ));
  };
  const removeChild = (branchId: string, childId: string) => {
    setBranches(branches.map(b =>
      b.id === branchId
        ? { ...b, children: b.children.filter(c => c.id !== childId) }
        : b
    ));
    setConnections(connections.filter(c => c.fromId !== childId && c.toId !== childId));
  };
  const removeConnection = (idx: number) => {
    setConnections(connections.filter((_, i) => i !== idx));
  };

  // Quick-connect flow: click "link" on node → pick target → enter label
  const startConnect = (fromId: string) => {
    setConnectingFrom(connectingFrom === fromId ? null : fromId);
  };
  const finishConnect = (toId: string) => {
    if (!connectingFrom || connectingFrom === toId) return;
    // Check if already connected
    const exists = connections.some(c =>
      (c.fromId === connectingFrom && c.toId === toId) ||
      (c.fromId === toId && c.toId === connectingFrom)
    );
    if (!exists) {
      setConnections([...connections, { fromId: connectingFrom, toId, label: '' }]);
    }
    setConnectingFrom(null);
  };
  const updateConnectionLabel = (idx: number, label: string) => {
    setConnections(connections.map((c, i) => i === idx ? { ...c, label } : c));
  };

  const handleImageUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const data = await resizeImage(file, 1600);
      setImage(data);
    } catch {
      setUploadError('Грешка при качване на изображението');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasContent = branches.some(b => b.text.trim()) || image;

  // Render connection pills for a node
  const renderConnectionPills = (nodeId: string) => {
    const nodeConns = connectionsForNode.get(nodeId) || [];
    if (nodeConns.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {nodeConns.map((conn, ci) => {
          const otherId = conn.fromId === nodeId ? conn.toId : conn.fromId;
          const other = nodeMap.get(otherId);
          const connIdx = connections.indexOf(conn);
          return (
            <span key={ci} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-700/40 border border-slate-600/40 rounded-full text-[10px] font-mono text-slate-400">
              <Link2 size={8} className="text-teal-500" />
              {conn.fromId === nodeId ? '→' : '←'} {other?.text || '?'}
              {conn.label && <span className="text-slate-500">: {conn.label}</span>}
              <button onClick={() => removeConnection(connIdx)} className="ml-0.5 hover:text-red-400">
                <X size={8} />
              </button>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Network size={24} className="text-teal-400" />
        <div>
          <h3 className="text-lg font-mono font-semibold text-slate-200">Mind Map</h3>
          <p className="text-xs text-slate-500 font-mono">Покажи как са свързани концепциите</p>
        </div>
      </div>

      {/* ═══ VISUAL PREVIEW ═══ */}
      {(central.trim() || filledBranches.length > 0) && (
        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 overflow-x-auto">
          {/* Central concept node */}
          <div className="flex justify-center">
            <div className="px-5 py-2 bg-teal-500/20 border-2 border-teal-500/50 rounded-full text-teal-300 font-mono text-sm font-semibold max-w-[250px] truncate">
              {central || topicName}
            </div>
          </div>

          {filledBranches.length > 0 && (
            <>
              {/* Vertical trunk line */}
              <div className="flex justify-center">
                <div className="w-px h-4 bg-slate-600/60" />
              </div>

              {/* Branches with horizontal connector */}
              <div className="flex justify-center">
                <div className="inline-flex">
                  {filledBranches.map((branch, idx) => {
                    const color = BRANCH_COLORS[idx % BRANCH_COLORS.length];
                    const isFirst = idx === 0;
                    const isLast = idx === filledBranches.length - 1;
                    const filledChildren = branch.children.filter(c => c.text.trim());

                    return (
                      <div key={branch.id} className="flex flex-col items-center px-2 min-w-[90px]">
                        {/* Horizontal connector + vertical drop */}
                        <div className="flex w-full h-3">
                          <div className={`flex-1 ${isFirst ? '' : 'border-t border-slate-600/50'}`} />
                          <div className="w-px bg-slate-600/50 h-full" />
                          <div className={`flex-1 ${isLast ? '' : 'border-t border-slate-600/50'}`} />
                        </div>
                        {/* Branch node */}
                        <div className={`px-3 py-1.5 ${color.previewBg} border ${color.previewBorder} rounded-lg text-xs font-mono ${color.previewText} max-w-[140px] truncate text-center`}>
                          {branch.text}
                        </div>
                        {/* Sub-branches */}
                        {filledChildren.length > 0 && (
                          <div className="flex flex-col items-center gap-0.5 mt-1">
                            {filledChildren.map(child => (
                              <div key={child.id} className="flex items-center gap-1">
                                <div className={`w-1 h-1 rounded-full ${color.dot}`} />
                                <span className="text-[10px] font-mono text-slate-500 max-w-[120px] truncate">{child.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cross-connections in preview */}
              {validConnections.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/40 flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {validConnections.map((conn, idx) => {
                    const from = nodeMap.get(conn.fromId);
                    const to = nodeMap.get(conn.toId);
                    return (
                      <span key={idx} className="inline-flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-slate-400">{from?.text || '?'}</span>
                        <span className="text-teal-500">→</span>
                        <span className="text-slate-400">{to?.text || '?'}</span>
                        {conn.label && <span className="text-slate-600">({conn.label})</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ CENTRAL CONCEPT ═══ */}
      <div>
        <label className="block text-xs text-slate-500 font-mono mb-1.5 uppercase tracking-wider">
          Централен концепт
        </label>
        <input
          value={central}
          onChange={(e) => setCentral(e.target.value)}
          placeholder={topicName}
          className="w-full px-4 py-3 bg-teal-500/10 border-2 border-teal-500/40 rounded-xl text-teal-300 font-mono font-semibold text-center text-lg focus:border-teal-400 focus:outline-none placeholder:text-teal-600/50"
        />
        {renderConnectionPills('central')}
      </div>

      {/* ═══ BRANCHES ═══ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 font-mono uppercase tracking-wider">
            Клонове ({branches.length})
          </label>
          <button
            onClick={addBranch}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 rounded-lg transition-colors"
          >
            <Plus size={14} /> Клон
          </button>
        </div>

        {/* Connecting mode banner */}
        {connectingFrom && (
          <div className="mb-2 px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-lg flex items-center justify-between">
            <span className="text-xs font-mono text-teal-400">
              <Link2 size={12} className="inline mr-1" />
              Натисни <span className="font-bold">🔗</span> на друг възел за да свържеш
            </span>
            <button onClick={() => setConnectingFrom(null)} className="text-xs text-slate-400 hover:text-red-400">
              Откажи
            </button>
          </div>
        )}

        <div className="space-y-3">
          {branches.map((branch, branchIdx) => {
            const color = BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];
            const isConnecting = connectingFrom === branch.id;
            const isTarget = connectingFrom && connectingFrom !== branch.id;

            return (
              <div key={branch.id} className={`pl-4 border-l-2 ${color.borderL} rounded-r-lg`}>
                {/* Branch input */}
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`} />
                  <input
                    value={branch.text}
                    onChange={(e) => updateBranch(branch.id, e.target.value)}
                    placeholder="Основен клон..."
                    className={`flex-1 px-3 py-2 ${color.bg} border ${color.border} rounded-lg text-sm font-mono ${color.text} focus:outline-none focus:ring-1 focus:ring-teal-500/50 placeholder:text-slate-600`}
                    autoFocus={!branch.text}
                  />
                  {/* Connect button */}
                  {branch.text.trim() && (
                    <button
                      onClick={() => isTarget ? finishConnect(branch.id) : startConnect(branch.id)}
                      className={`p-1.5 transition-colors rounded ${
                        isConnecting ? 'text-teal-400 bg-teal-500/20' :
                        isTarget ? 'text-teal-400 bg-teal-500/10 animate-pulse' :
                        'text-slate-600 hover:text-teal-400'
                      }`}
                      title={isTarget ? 'Свържи тук' : 'Свържи с друг възел'}
                    >
                      <Link2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => addChild(branch.id)}
                    className="p-1.5 text-slate-500 hover:text-teal-400 transition-colors"
                    title="Добави под-клон"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => removeBranch(branch.id)}
                    className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Connection pills for this branch */}
                <div className="ml-5">
                  {renderConnectionPills(branch.id)}
                </div>

                {/* Sub-branches */}
                {branch.children.length > 0 && (
                  <div className="ml-7 space-y-1.5 mt-1.5">
                    {branch.children.map((child) => {
                      const isChildTarget = connectingFrom && connectingFrom !== child.id;
                      return (
                        <div key={child.id}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${color.text} opacity-40`}>└</span>
                            <input
                              value={child.text}
                              onChange={(e) => updateChild(branch.id, child.id, e.target.value)}
                              placeholder="Под-клон..."
                              className="flex-1 px-3 py-1.5 bg-slate-800/40 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-300 focus:border-teal-500 focus:outline-none placeholder:text-slate-600"
                              autoFocus={!child.text}
                            />
                            {child.text.trim() && (
                              <button
                                onClick={() => isChildTarget ? finishConnect(child.id) : startConnect(child.id)}
                                className={`p-1 transition-colors rounded ${
                                  connectingFrom === child.id ? 'text-teal-400 bg-teal-500/20' :
                                  isChildTarget ? 'text-teal-400 bg-teal-500/10 animate-pulse' :
                                  'text-slate-600 hover:text-teal-400'
                                }`}
                                title={isChildTarget ? 'Свържи тук' : 'Свържи с друг възел'}
                              >
                                <Link2 size={11} />
                              </button>
                            )}
                            <button
                              onClick={() => removeChild(branch.id, child.id)}
                              className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                          <div className="ml-5">
                            {renderConnectionPills(child.id)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {branches.length === 0 && (
            <p className="text-center text-sm text-slate-600 font-mono py-4">
              Натисни &quot;+ Клон&quot; за да добавиш първия клон
            </p>
          )}
        </div>
      </div>

      {/* ═══ CONNECTIONS LIST ═══ */}
      {connections.length > 0 && (
        <div>
          <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-2">
            Връзки ({connections.length})
          </label>
          <div className="space-y-2">
            {connections.map((conn, idx) => {
              const from = nodeMap.get(conn.fromId);
              const to = nodeMap.get(conn.toId);
              return (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded-lg">
                  <span className="text-xs font-mono text-slate-300 shrink-0">{from?.text || '?'}</span>
                  <ArrowRight size={12} className="text-teal-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-300 shrink-0">{to?.text || '?'}</span>
                  <input
                    value={conn.label}
                    onChange={(e) => updateConnectionLabel(idx, e.target.value)}
                    placeholder="каква е връзката..."
                    className="flex-1 px-2 py-1 bg-transparent border-b border-slate-700 text-xs font-mono text-teal-400 focus:border-teal-500 focus:outline-none placeholder:text-slate-600"
                  />
                  <button onClick={() => removeConnection(idx)} className="p-1 text-slate-600 hover:text-red-400">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hint for connecting */}
      {filledBranches.length >= 2 && connections.length === 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-slate-600 font-mono">
            💡 Натисни <Link2 size={10} className="inline text-teal-500" /> на клон, после на друг клон, за да ги свържеш
          </p>
        </div>
      )}

      {/* ═══ IMAGE UPLOAD ═══ */}
      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 font-mono mb-2">
          Или качи снимка на ръчно нарисувана Mind Map:
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
        {image ? (
          <div className="relative">
            <img src={image} alt="Mind Map" className="w-full rounded-lg border border-slate-700 max-h-80 object-contain bg-slate-900" />
            <button
              onClick={() => setImage(null)}
              className="absolute top-2 right-2 p-1.5 bg-red-600/80 text-white rounded-full hover:bg-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 w-full justify-center bg-slate-800/50 border border-dashed border-slate-600 rounded-xl text-sm font-mono text-slate-400 hover:text-teal-400 hover:border-teal-500/50 transition-colors"
          >
            <Upload size={18} />
            Качи снимка
          </button>
        )}
        {uploadError && (
          <p className="text-xs text-red-400 font-mono mt-1">{uploadError}</p>
        )}
      </div>

      {/* ═══ EVALUATE BUTTON ═══ */}
      <button
        onClick={onEvaluate}
        disabled={isEvaluating || !hasContent}
        className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold rounded-xl font-mono disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
      >
        {isEvaluating ? (
          <>
            <Loader2 size={22} className="animate-spin" />
            AI оценява Mind Map...
          </>
        ) : (
          <>
            <Network size={22} />
            Оцени Mind Map
          </>
        )}
      </button>
    </div>
  );
}

// Serialize mind map to text for API
export function serializeMindMap(
  central: string,
  branches: MindMapBranch[],
  connections: MindMapConnection[]
): string {
  const lines: string[] = [];
  lines.push(`ЦЕНТРАЛЕН КОНЦЕПТ: ${central}`);
  lines.push('');
  lines.push('КЛОНОВЕ:');

  const nodeMap = new Map<string, string>();
  nodeMap.set('central', central);

  for (const branch of branches) {
    if (!branch.text.trim()) continue;
    nodeMap.set(branch.id, branch.text);
    lines.push(`├── ${branch.text}`);
    for (const child of branch.children) {
      if (!child.text.trim()) continue;
      nodeMap.set(child.id, child.text);
      lines.push(`│   └── ${child.text}`);
    }
  }

  const validConnections = connections.filter(c => c.fromId && c.toId && c.label.trim());
  if (validConnections.length > 0) {
    lines.push('');
    lines.push('ВРЪЗКИ:');
    for (const conn of validConnections) {
      const from = nodeMap.get(conn.fromId) || '?';
      const to = nodeMap.get(conn.toId) || '?';
      lines.push(`${from} → ${to}: ${conn.label}`);
    }
  }

  return lines.join('\n');
}
