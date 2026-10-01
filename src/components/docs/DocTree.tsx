import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Copy, FileText, Folder, Plus, Pencil, Trash2, FolderInput, FolderOutput } from 'lucide-react';
import type { DocNode } from '../../lib/types';

export interface TreeNode extends DocNode {
  children: TreeNode[];
  depth: number;
}

const TREE_FOLDER_COLORS = [
  'text-liquid-indigo bg-liquid-indigo/10',
  'text-sky-700 bg-sky-100',
  'text-emerald-700 bg-emerald-100',
  'text-amber-700 bg-amber-100',
  'text-rose-700 bg-rose-100',
  'text-violet-700 bg-violet-100',
];

function treeFolderColor(id: string) {
  const sum = Array.from(id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TREE_FOLDER_COLORS[sum % TREE_FOLDER_COLORS.length];
}

export function buildTree(list: DocNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  list.forEach((d) => {
    map.set(d.id, { ...d, children: [], depth: 0 });
  });
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

interface Props {
  tree: TreeNode[];
  selectedId?: string | null;
  canManage?: (doc: DocNode) => boolean;
  onSelect: (doc: DocNode) => void;
  onCreateChild?: (parent: DocNode | null) => void;
  onRename?: (doc: DocNode) => void;
  onDelete?: (doc: DocNode) => void;
  onMove?: (doc: DocNode, newParentId: string | null) => void;
  onCopyToPublic?: (doc: DocNode) => void;
  onMoveToPublic?: (doc: DocNode) => void;
  onMoveToPrivate?: (doc: DocNode) => void;
}

export function DocTree({
  tree,
  selectedId,
  canManage,
  onSelect,
  onCreateChild,
  onRename,
  onDelete,
  onMove,
  onCopyToPublic,
  onMoveToPublic,
  onMoveToPrivate,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragOverId, setDragOverId] = useState<string | 'ROOT' | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function isAncestor(ancestor: TreeNode, candidateId: string): boolean {
    if (ancestor.id === candidateId) return true;
    return ancestor.children.some((c) => isAncestor(c, candidateId));
  }

  const findNode = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (arr: TreeNode[]) => {
      arr.forEach((n) => {
        map.set(n.id, n);
        walk(n.children);
      });
    };
    walk(tree);
    return (id: string) => map.get(id);
  }, [tree]);

  const handleDrop = (draggedId: string, targetId: string | null) => {
    if (!onMove) return;
    if (draggedId === targetId) return;
    const dragged = findNode(draggedId);
    if (!dragged) return;
    if (targetId && isAncestor(dragged, targetId)) {
      // 阻止把节点拖到自己的子孙下
      return;
    }
    if (dragged.parentId === targetId) return;
    onMove(dragged, targetId);
  };

  const renderNode = (node: TreeNode) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const selected = selectedId === node.id;
    const dragOver = dragOverId === node.id;
    const manageable = !canManage || canManage(node);
    return (
      <li key={node.id}>
        <div
          draggable={!!onMove && manageable}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!onMove) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverId(node.id);
          }}
          onDragLeave={() => {
            setDragOverId((id) => (id === node.id ? null : id));
          }}
          onDrop={(e) => {
            if (!onMove) return;
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            setDragOverId(null);
            if (draggedId) handleDrop(draggedId, node.id);
          }}
          className={`group flex items-center gap-1 pr-1 rounded-md cursor-pointer transition-colors ${
            selected ? 'bg-liquid-indigo/10 text-liquid-indigo' : 'hover:bg-black/5 text-text-primary'
          } ${dragOver ? `ring-2 ring-liquid-indigo/40 ${node.isFolder ? 'scale-[1.02] shadow-md' : ''}` : ''}`}
          style={{ paddingLeft: 4 + node.depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              className="w-5 h-6 inline-flex items-center justify-center text-text-secondary"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <button
            type="button"
            onClick={() => onSelect(node)}
            className="flex-1 flex items-center gap-1.5 py-1.5 text-sm text-left min-w-0"
          >
            {node.isFolder ? (
              <span className={`w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 ${treeFolderColor(node.id)}`}>
                <Folder size={13} />
              </span>
            ) : (
              <FileText size={13} className="shrink-0 opacity-70" />
            )}
            <span className="truncate">{node.title}</span>
          </button>
          {manageable && (
            <div className="hidden group-hover:flex items-center gap-0.5">
              {onCreateChild && (
                <button
                  type="button"
                  title="新建子文档"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChild(node);
                    setExpanded((prev) => new Set(prev).add(node.id));
                  }}
                  className="p-1 text-text-secondary hover:text-liquid-indigo rounded"
                >
                  <Plus size={12} />
                </button>
              )}
              {onRename && (
                <button
                  type="button"
                  title="重命名"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(node);
                  }}
                  className="p-1 text-text-secondary hover:text-liquid-indigo rounded"
                >
                  <Pencil size={12} />
                </button>
              )}
              {onCopyToPublic && !node.isFolder && (
                <button
                  type="button"
                  title="复制到公共知识库"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyToPublic(node);
                  }}
                  className="p-1 text-text-secondary hover:text-liquid-indigo rounded"
                >
                  <Copy size={12} />
                </button>
              )}
              {onMoveToPublic && (
                <button
                  type="button"
                  title="移动到公共知识库"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToPublic(node);
                  }}
                  className="p-1 text-text-secondary hover:text-liquid-indigo rounded"
                >
                  <FolderInput size={12} />
                </button>
              )}
              {onMoveToPrivate && (
                <button
                  type="button"
                  title="移到我的私密空间"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToPrivate(node);
                  }}
                  className="p-1 text-text-secondary hover:text-liquid-indigo rounded"
                >
                  <FolderOutput size={12} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                  className="p-1 text-text-secondary hover:text-red-500 rounded"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
        {hasChildren && isOpen && (
          <ul className="space-y-0.5">{node.children.map(renderNode)}</ul>
        )}
      </li>
    );
  };

  return (
    <div
      className={`relative ${dragOverId === 'ROOT' ? 'ring-2 ring-liquid-indigo/40 rounded-md' : ''}`}
      onDragOver={(e) => {
        if (!onMove) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverId('ROOT');
      }}
      onDragLeave={() => setDragOverId((id) => (id === 'ROOT' ? null : id))}
      onDrop={(e) => {
        if (!onMove) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        setDragOverId(null);
        if (draggedId) handleDrop(draggedId, null);
      }}
    >
      {tree.length === 0 ? (
        <div className="text-xs text-text-secondary p-3 text-center">没有文档</div>
      ) : (
        <ul className="space-y-0.5">{tree.map(renderNode)}</ul>
      )}
      {onCreateChild && (
        <button
          type="button"
          onClick={() => onCreateChild(null)}
          className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-liquid-indigo py-2 rounded-md border border-dashed border-black/10"
        >
          <Plus size={12} /> 在根目录新建
        </button>
      )}
    </div>
  );
}
