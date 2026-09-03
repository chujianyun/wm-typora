import type { WorkspaceEntry } from "../native/types";
import type { OutlineItem } from "../workspace/outline";
import type { SidebarTab } from "../workspace/workspaceStore";

interface SidebarProps {
  activeTab: SidebarTab;
  entries: WorkspaceEntry[];
  outline: OutlineItem[];
  expandedPaths: Set<string>;
  activeOutlineId: string | null;
  onTab(tab: SidebarTab): void;
  onOpenFile(path: string): void;
  onToggleDirectory(path: string): void;
  onNavigate(item: OutlineItem): void;
}

function FileEntries({ entries, expanded, onOpenFile, onToggleDirectory }: {
  entries: WorkspaceEntry[];
  expanded: Set<string>;
  onOpenFile(path: string): void;
  onToggleDirectory(path: string): void;
}) {
  return (
    <ul className="tree-list">
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.kind === "directory" ? (
            <>
              <button className="tree-row directory" onClick={() => onToggleDirectory(entry.path)}>
                <span>{expanded.has(entry.path) ? "⌄" : "›"}</span> {entry.name}
              </button>
              {expanded.has(entry.path) && entry.children ? (
                <FileEntries
                  entries={entry.children}
                  expanded={expanded}
                  onOpenFile={onOpenFile}
                  onToggleDirectory={onToggleDirectory}
                />
              ) : null}
            </>
          ) : (
            <button className="tree-row file" onClick={() => onOpenFile(entry.path)}>{entry.name}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function OutlineEntries({ items, activeId, onNavigate }: { items: OutlineItem[]; activeId: string | null; onNavigate(item: OutlineItem): void }) {
  return (
    <ul className="outline-list">
      {items.map((item) => (
        <li key={`${item.line}-${item.id}`}>
          <button aria-current={activeId === item.id ? "location" : undefined} style={{ paddingLeft: `${(item.level - 1) * 12 + 10}px` }} onClick={() => onNavigate(item)}>
            {item.text}
          </button>
          {item.children.length ? <OutlineEntries items={item.children} activeId={activeId} onNavigate={onNavigate} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="侧栏">
      <div className="sidebar-tabs" role="tablist" aria-label="侧栏视图">
        <button role="tab" aria-selected={props.activeTab === "files"} onClick={() => props.onTab("files")}>文件</button>
        <button role="tab" aria-selected={props.activeTab === "outline"} onClick={() => props.onTab("outline")}>大纲</button>
      </div>
      <div className="sidebar-content">
        {props.activeTab === "files" ? (
          props.entries.length ? (
            <FileEntries
              entries={props.entries}
              expanded={props.expandedPaths}
              onOpenFile={props.onOpenFile}
              onToggleDirectory={props.onToggleDirectory}
            />
          ) : <p className="empty-state">打开文件夹后在这里浏览文档</p>
        ) : props.outline.length ? (
          <OutlineEntries items={props.outline} activeId={props.activeOutlineId} onNavigate={props.onNavigate} />
        ) : <p className="empty-state">添加标题以生成大纲</p>}
      </div>
    </aside>
  );
}
