import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Network,
  Search,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  BookOpen,
  MessageSquare,
  Brain,
  Layers,
  FileText,
  X,
  ExternalLink,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { DocumentItem, ModelStatus, Flashcard, SmartNote } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import { buildSmartNotesPrompt } from '../../lib/rag/harness';

interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'concept' | 'topic';
  docId: string;
  docTitle: string;
  definition?: string;
  excerpt?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isPinned?: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
}

interface ConceptGraphViewProps {
  documents: DocumentItem[];
  selectedDocId?: string | null;
  selectedDocIds?: string[];
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
  onNavigateToChat: (queryPrompt: string) => void;
}

const DOC_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#3b82f6', // Blue
];

export const ConceptGraphView: React.FC<ConceptGraphViewProps> = ({
  documents,
  selectedDocId,
  selectedDocIds = [],
  modelStatus,
  onInitializeModel,
  onNavigateToChat,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [targetScope, setTargetScope] = useState<string>(() => {
    if (selectedDocIds.length > 1) return 'group';
    if (selectedDocId) return selectedDocId;
    return documents[0]?.id ?? 'all';
  });

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [flashcardAdded, setFlashcardAdded] = useState(false);

  // Transform (pan & zoom)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Keep target docs synced
  const activeDocs = useMemo(() => {
    if (targetScope === 'group') {
      const docs = documents.filter((d) => selectedDocIds.includes(d.id));
      return docs.length > 0 ? docs : documents;
    }
    if (targetScope === 'all') {
      return documents;
    }
    const single = documents.find((d) => d.id === targetScope);
    return single ? [single] : documents;
  }, [targetScope, documents, selectedDocIds]);

  // Build the graph from IndexedDB smart notes & chunks
  const buildGraphData = useCallback(async () => {
    if (activeDocs.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const docIds = activeDocs.map((d) => d.id);
    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    const centerX = 400;
    const centerY = 300;

    // 1. Add Document Hub Nodes
    activeDocs.forEach((doc, idx) => {
      const angle = (idx / activeDocs.length) * Math.PI * 2;
      const dist = activeDocs.length === 1 ? 0 : 160;
      const color = DOC_COLORS[idx % DOC_COLORS.length];

      const docNode: GraphNode = {
        id: `doc_${doc.id}`,
        label: doc.title,
        type: 'document',
        docId: doc.id,
        docTitle: doc.title,
        definition: `Document containing ${doc.chunkCount} chunks (${Math.round(doc.size / 1024)} KB).`,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 26,
        color,
      };

      newNodes.push(docNode);
      nodeMap.set(docNode.id, docNode);
    });

    // 2. Fetch existing smart notes for concepts
    const savedNotes = await db.notes.where('docId').anyOf(docIds).toArray();
    const conceptRegistry = new Map<string, { term: string; def: string; docId: string; docTitle: string }[]>();

    for (const note of savedNotes) {
      if (note.keyConcepts) {
        for (const kc of note.keyConcepts) {
          const key = kc.term.trim().toLowerCase();
          const existing = conceptRegistry.get(key) || [];
          existing.push({
            term: kc.term.trim(),
            def: kc.definition,
            docId: note.docId,
            docTitle: note.docTitle,
          });
          conceptRegistry.set(key, existing);
        }
      }
    }

    // 3. Fallback: Extract from document chunks if notes aren't generated yet
    if (conceptRegistry.size === 0) {
      for (const doc of activeDocs) {
        const sampleChunks = await db.chunks.where('docId').equals(doc.id).limit(4).toArray();
        sampleChunks.forEach((c, cIdx) => {
          // Extract title-like phrases or keywords
          const words = c.text
            .replace(/[#*`_()]/g, ' ')
            .split(/\n+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 3 && s.length < 35 && !s.includes('.') && !s.startsWith('-'));

          const picked = words.slice(0, 2);
          picked.forEach((p) => {
            const key = p.toLowerCase();
            const existing = conceptRegistry.get(key) || [];
            existing.push({
              term: p,
              def: c.text.slice(0, 180) + '...',
              docId: doc.id,
              docTitle: doc.title,
            });
            conceptRegistry.set(key, existing);
          });
        });
      }
    }

    // 4. Create Concept Nodes & Inter-Document Edges
    let conceptIndex = 0;
    const totalConcepts = Math.min(24, conceptRegistry.size);

    for (const [key, occurrences] of conceptRegistry.entries()) {
      if (conceptIndex >= totalConcepts) break;
      const first = occurrences[0];
      const parentDocNode = nodeMap.get(`doc_${first.docId}`);
      const parentColor = parentDocNode ? parentDocNode.color : '#818cf8';

      const angle = (conceptIndex / totalConcepts) * Math.PI * 2;
      const dist = 140 + (conceptIndex % 3) * 45;
      const originX = parentDocNode ? parentDocNode.x : centerX;
      const originY = parentDocNode ? parentDocNode.y : centerY;

      const conceptNodeId = `concept_${key.replace(/[^a-z0-9]/g, '_')}_${conceptIndex}`;
      const conceptNode: GraphNode = {
        id: conceptNodeId,
        label: first.term,
        type: occurrences.length > 1 ? 'topic' : 'concept',
        docId: first.docId,
        docTitle: first.docTitle,
        definition: first.def,
        excerpt: first.def,
        x: originX + Math.cos(angle) * dist,
        y: originY + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: occurrences.length > 1 ? 18 : 14,
        color: occurrences.length > 1 ? '#f59e0b' : parentColor,
      };

      newNodes.push(conceptNode);
      nodeMap.set(conceptNodeId, conceptNode);

      // Connect concept to each document it appears in
      for (const occ of occurrences) {
        newEdges.push({
          source: `doc_${occ.docId}`,
          target: conceptNodeId,
          strength: 0.12,
        });
      }

      conceptIndex++;
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [activeDocs]);

  useEffect(() => {
    buildGraphData();
  }, [buildGraphData]);

  // Run AI Deep Concept Extraction
  const handleExtractDeepConcepts = async () => {
    if (activeDocs.length === 0) return;
    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsExtracting(true);
    try {
      for (const doc of activeDocs) {
        const chunks = await db.chunks.where('docId').equals(doc.id).limit(4).toArray();
        if (chunks.length === 0) continue;

        const combinedText = chunks.map((c) => c.text).join('\n\n');
        const { system, user } = buildSmartNotesPrompt(combinedText, doc.title);

        const notesText = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.2, max_tokens: 650 }
        );

        // Parse key concepts: ### Core Concepts \n - **[Concept]**: [Def]
        const conceptMatches = notesText.matchAll(/-\s*\*\*([^*]+)\*\*:\s*([^\n]+)/g);
        const extractedConcepts: { term: string; definition: string }[] = [];
        for (const match of conceptMatches) {
          extractedConcepts.push({
            term: match[1].trim(),
            definition: match[2].trim(),
          });
        }

        if (extractedConcepts.length > 0) {
          const newNote: SmartNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            docId: doc.id,
            docTitle: doc.title,
            title: `AI Extracted Concepts: ${doc.title}`,
            summary: 'Auto-extracted concept nodes for Mind Map',
            keyConcepts: extractedConcepts,
            takeaways: [],
            studyQuestions: [],
            createdAt: Date.now(),
          };
          await db.notes.put(newNote);
        }
      }

      await buildGraphData();
    } catch (err: any) {
      console.error('Concept extraction error:', err);
      alert(`Concept extraction: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Convert concept to SM-2 flashcard
  const handleCreateFlashcardFromNode = async (node: GraphNode) => {
    if (!node.definition) return;
    const newCard: Flashcard = {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      docId: node.docId,
      docTitle: node.docTitle,
      front: `What is the significance or definition of "${node.label}"?`,
      back: node.definition,
      interval: 1,
      repetition: 0,
      easeFactor: 2.5,
      dueDate: Date.now(),
      createdAt: Date.now(),
    };

    await db.flashcards.put(newCard);
    setFlashcardAdded(true);
    setTimeout(() => setFlashcardAdded(false), 2500);
  };

  // Physics simulation loop (Springs + Repulsion + Velocity Verlet)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const runSimulationStep = () => {
      const nodeMap = new Map<string, GraphNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      // 1. Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 100;
          const dist = Math.sqrt(distSq);

          const force = (1800 * (n1.radius * n2.radius)) / (distSq * 100);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.isPinned) {
            n1.vx -= fx;
            n1.vy -= fy;
          }
          if (!n2.isPinned) {
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // 2. Spring attraction along edges
      for (const edge of edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = source.type === 'document' ? 120 : 80;
        const displacement = dist - targetDist;
        const springForce = displacement * edge.strength * 0.15;

        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (!source.isPinned) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.isPinned) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // 3. Center gravity & velocity dampening
      const centerX = canvas.width / (2 * (window.devicePixelRatio || 1));
      const centerY = canvas.height / (2 * (window.devicePixelRatio || 1));

      for (const node of nodes) {
        if (!node.isPinned) {
          const toCenterX = centerX - node.x;
          const toCenterY = centerY - node.y;
          node.vx += toCenterX * 0.003;
          node.vy += toCenterY * 0.003;

          node.vx *= 0.88; // Damping
          node.vy *= 0.88;

          node.x += node.vx;
          node.y += node.vy;
        }
      }

      // 4. Render
      renderCanvas(ctx, canvas);

      animationFrameId = requestAnimationFrame(runSimulationStep);
    };

    animationFrameId = requestAnimationFrame(runSimulationStep);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, edges, transform, searchQuery, selectedNode]);

  // Canvas drawing
  const renderCanvas = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply Pan & Zoom
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const isDarkMode = document.documentElement.classList.contains('dark');

    // 1. Draw Edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isDarkMode ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 2. Draw Nodes
    for (const node of nodes) {
      const isSelected = selectedNode?.id === node.id;
      const isMatch =
        searchQuery.trim().length > 0 &&
        node.label.toLowerCase().includes(searchQuery.toLowerCase());

      // Glow effect for selected or search matched node
      if (isSelected || isMatch) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? 'rgba(99, 102, 241, 0.35)'
          : 'rgba(245, 158, 11, 0.35)';
        ctx.fill();
      }

      // Base circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Border ring
      ctx.strokeStyle = isDarkMode ? '#1e293b' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Node Label
      ctx.font = `${node.type === 'document' ? 'bold 12px' : '11px'} system-ui, sans-serif`;
      ctx.fillStyle = isDarkMode ? '#f8fafc' : '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate long label
      const maxLen = node.type === 'document' ? 18 : 14;
      const displayLabel =
        node.label.length > maxLen ? node.label.slice(0, maxLen) + '...' : node.label;

      ctx.fillText(displayLabel, node.x, node.y + node.radius + 12);
    }

    ctx.restore();
  };

  // Mouse / Touch handlers for interaction
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Undo transform
    const x = (mouseX - transform.x) / transform.scale;
    const y = (mouseY - transform.y) / transform.scale;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    // Check if clicked a node
    const clickedNode = nodes.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.isPinned = true;
      setSelectedNode(clickedNode);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      const { x, y } = getCanvasCoords(e);
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isDraggingCanvasRef.current) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.isPinned = false;
      draggedNodeRef.current = null;
    }
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((prev) => {
      const newScale = Math.min(2.5, Math.max(0.4, prev.scale * zoomFactor));
      return { ...prev, scale: newScale };
    });
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
      {/* Graph Toolbar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur px-4 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 z-10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl ring-1 ring-indigo-500/20 shrink-0">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Concept Graph & Mind Map
              </h1>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                {nodes.length} Nodes • {edges.length} Links
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Knowledge network mapping documents to extracted concepts
            </p>
          </div>
        </div>

        {/* Scope and Graph Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Search nodes */}
          <div className="relative w-36 sm:w-44">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Highlight concept..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 text-xs pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Scope Selector */}
          <select
            value={targetScope}
            onChange={(e) => setTargetScope(e.target.value)}
            className="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[180px] sm:max-w-[220px] truncate"
          >
            <option value="all">📚 All Documents</option>
            {selectedDocIds.length > 1 && (
              <option value="group">📁 Active Group ({selectedDocIds.length})</option>
            )}
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                📄 {d.title}
              </option>
            ))}
          </select>

          {/* Extract Concepts with AI Button */}
          {documents.length > 0 && (
            <button
              onClick={handleExtractDeepConcepts}
              disabled={isExtracting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isExtracting ? 'Analyzing...' : 'Extract Concepts'}</span>
            </button>
          )}

          {/* Zoom & Reset Controls */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-0.5">
            <button
              onClick={() =>
                setTransform((prev) => ({ ...prev, scale: Math.min(2.5, prev.scale * 1.2) }))
              }
              className="p-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-lg"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() =>
                setTransform((prev) => ({ ...prev, scale: Math.max(0.4, prev.scale * 0.8) }))
              }
              className="p-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-lg"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={resetView}
              className="p-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-lg"
              title="Reset View"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative w-full h-full cursor-grab active:cursor-grabbing">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <Network className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              No Concepts Extracted Yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              Upload documents or click below to have the small browser model extract an interactive concept graph.
            </p>
            {documents.length > 0 && (
              <button
                onClick={handleExtractDeepConcepts}
                disabled={isExtracting}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span>Extract Concept Map</span>
              </button>
            )}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full block"
          />
        )}

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl z-20 animate-fade-in space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedNode.color }}
                />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {selectedNode.label}
                </h3>
              </div>

              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                {selectedNode.type}
              </span>
              <span className="truncate" title={selectedNode.docTitle}>
                📄 {selectedNode.docTitle}
              </span>
            </div>

            {selectedNode.definition && (
              <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 leading-relaxed max-h-48 overflow-y-auto">
                {selectedNode.definition}
              </div>
            )}

            {/* Actions for this concept node */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  onNavigateToChat(
                    `Explain the concept of "${selectedNode.label}" and how it relates to ${selectedNode.docTitle} in detail.`
                  );
                }}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Ask AI About This Concept</span>
              </button>

              <button
                onClick={() => handleCreateFlashcardFromNode(selectedNode)}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700"
              >
                {flashcardAdded ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Saved to Flashcards!
                    </span>
                  </>
                ) : (
                  <>
                    <Brain className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Create SM-2 Recall Card</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
