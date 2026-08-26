import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GraphNode } from "../lib/types";
import { buildFileTree, flattenSingleChild, type DirNode } from "../lib/folderTree";

interface PathFilterPanelProps {
  /* Unscoped, budget-limited node list — the same one Sidebar's folder tree
   * is built from. A folder only shows up here once at least one of its
   * nodes has been loaded, same circularity as the existing Sidebar tree:
   * raise the node budget once to discover a folder, then scope down to it
   * and lower the budget again. */
  nodes: GraphNode[];
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
  onClear: () => void;
}

function PathTreeItem({ dir, depth, selectedPaths, onToggle }: {
  dir: DirNode; depth: number;
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...dir.children.values()].sort((a, b) => a.name.localeCompare(b.name)), [dir.children]);
  const checked = selectedPaths.has(dir.fullPath);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 w-full text-left px-3 py-[5px] text-[12px] transition-colors text-foreground/60 hover:text-foreground/80 hover:bg-white/[0.03]"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-foreground/20 w-3 text-center text-[10px] shrink-0"
        >
          {dir.children.size > 0 ? (expanded ? "▾" : "▸") : ""}
        </button>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(dir.fullPath)}
          className="shrink-0 accent-primary"
        />
        <span className="truncate font-medium">{dir.name}</span>
        <span className="text-foreground/15 ml-auto text-[10px] tabular-nums shrink-0">{dir.nodeIds.size}</span>
      </div>
      {expanded && sorted.map((c) => (
        <PathTreeItem key={c.fullPath} dir={c} depth={depth + 1} selectedPaths={selectedPaths} onToggle={onToggle} />
      ))}
    </div>
  );
}

export function PathFilterPanel({ nodes, selectedPaths, onToggle, onClear }: PathFilterPanelProps) {
  const tree = useMemo(() => flattenSingleChild(buildFileTree(nodes)), [nodes]);
  const topLevel = useMemo(
    () => [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [tree.children],
  );

  return (
    <div className="border-b border-border/30 shrink-0 max-h-[240px] flex flex-col">
      <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-widest">
          Path filter
        </span>
        {selectedPaths.size > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-primary/70 hover:text-primary transition-colors"
          >
            Clear ({selectedPaths.size})
          </button>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {topLevel.map((c) => (
            <PathTreeItem key={c.fullPath} dir={c} depth={0} selectedPaths={selectedPaths} onToggle={onToggle} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
