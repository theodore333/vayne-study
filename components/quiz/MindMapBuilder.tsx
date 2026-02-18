'use client';

import { useState, useRef } from 'react';
import { Plus, X, ArrowRight, Upload, Image as ImageIcon, Network, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
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

export function MindMapBuilder({
  central, setCentral,
  branches, setBranches,
  connections, setConnections,
  image, setImage,
  isEvaluating, onEvaluate, topicName
}: MindMapBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showConnections, setShowConnections] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Collect all nodes for connection dropdowns
  const allNodes = [
    { id: 'central', text: central || topicName },
    ...branches.flatMap(b => [
      { id: b.id, text: b.text },
      ...b.children.map(c => ({ id: c.id, text: c.text }))
    ])
  ].filter(n => n.text.trim());

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

  const addConnection = () => {
    setConnections([...connections, { fromId: '', toId: '', label: '' }]);
  };

  const updateConnection = (idx: number, field: keyof MindMapConnection, value: string) => {
    setConnections(connections.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeConnection = (idx: number) => {
    setConnections(connections.filter((_, i) => i !== idx));
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Network size={24} className="text-teal-400" />
        <div>
          <h3 className="text-lg font-mono font-semibold text-slate-200">Mind Map</h3>
          <p className="text-xs text-slate-500 font-mono">Покажи как са свързани концепциите</p>
        </div>
      </div>

      {/* Central Concept */}
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
      </div>

      {/* Branches */}
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

        <div className="space-y-3">
          {branches.map((branch) => (
            <div key={branch.id} className="pl-4 border-l-2 border-slate-700">
              {/* Branch input */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-slate-600 text-sm">├</span>
                <input
                  value={branch.text}
                  onChange={(e) => updateBranch(branch.id, e.target.value)}
                  placeholder="Основен клон..."
                  className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-teal-500 focus:outline-none placeholder:text-slate-600"
                  autoFocus={!branch.text}
                />
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

              {/* Sub-branches */}
              {branch.children.length > 0 && (
                <div className="ml-6 space-y-1.5">
                  {branch.children.map((child) => (
                    <div key={child.id} className="flex items-center gap-2">
                      <span className="text-slate-700 text-xs">└</span>
                      <input
                        value={child.text}
                        onChange={(e) => updateChild(branch.id, child.id, e.target.value)}
                        placeholder="Под-клон..."
                        className="flex-1 px-3 py-1.5 bg-slate-800/40 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-300 focus:border-teal-500 focus:outline-none placeholder:text-slate-600"
                        autoFocus={!child.text}
                      />
                      <button
                        onClick={() => removeChild(branch.id, child.id)}
                        className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {branches.length === 0 && (
            <p className="text-center text-sm text-slate-600 font-mono py-4">
              Натисни &quot;+ Клон&quot; за да добавиш първия клон
            </p>
          )}
        </div>
      </div>

      {/* Cross-connections */}
      <div>
        <button
          onClick={() => setShowConnections(!showConnections)}
          className="flex items-center gap-2 text-xs text-slate-500 font-mono uppercase tracking-wider hover:text-slate-400 transition-colors"
        >
          {showConnections ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Връзки между концепции ({connections.length})
        </button>

        {showConnections && (
          <div className="mt-2 space-y-2">
            {connections.map((conn, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={conn.fromId}
                  onChange={(e) => updateConnection(idx, 'fromId', e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 focus:border-teal-500 focus:outline-none"
                >
                  <option value="">От...</option>
                  {allNodes.map(n => <option key={n.id} value={n.id}>{n.text}</option>)}
                </select>
                <ArrowRight size={14} className="text-teal-500 shrink-0" />
                <select
                  value={conn.toId}
                  onChange={(e) => updateConnection(idx, 'toId', e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 focus:border-teal-500 focus:outline-none"
                >
                  <option value="">До...</option>
                  {allNodes.map(n => <option key={n.id} value={n.id}>{n.text}</option>)}
                </select>
                <input
                  value={conn.label}
                  onChange={(e) => updateConnection(idx, 'label', e.target.value)}
                  placeholder="Връзка..."
                  className="flex-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 focus:border-teal-500 focus:outline-none placeholder:text-slate-600"
                />
                <button onClick={() => removeConnection(idx)} className="p-1 text-slate-600 hover:text-red-400">
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={addConnection}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-500 hover:text-teal-400 transition-colors"
            >
              <Plus size={13} /> Добави връзка
            </button>
          </div>
        )}
      </div>

      {/* Image Upload */}
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

      {/* Evaluate button */}
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
