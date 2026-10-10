import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileCode,
  GitBranch,
  Globe,
  History,
  LayoutDashboard,
  type LucideIcon,
  Network,
  Plus,
  Puzzle,
  Settings as SettingsIcon,
  Terminal,
  X,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useTabStore } from '../../stores/tabStore'
import { filterNavByRole, getAllNavItems, NavItem, Role } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'
import ModalPortal from '../ui/ModalPortal'

const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  boxes: Boxes,
  network: Network,
  'book-open': BookOpen,
  terminal: Terminal,
  'file-code': FileCode,
  'git-branch': GitBranch,
  history: History,
  'calendar-clock': CalendarClock,
  globe: Globe,
  puzzle: Puzzle,
  settings: SettingsIcon,
}

export function TabBar() {
  const navigate = useNavigate()
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useTabStore()
  const { user, isAuthEnabled } = useAuth()
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [pendingNav, setPendingNav] = useState<NavItem | null>(null)

  const tabsRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const role: Role | null = (user?.role as Role) || null
  const openableNavItems = filterNavByRole(role, isAuthEnabled).flatMap((g) => g.items)

  const updateScrollButtons = useCallback(() => {
    if (!tabsRef.current || !containerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current
    setShowLeftScroll(scrollLeft > 8)
    setShowRightScroll(scrollLeft + clientWidth < scrollWidth - 8)
  }, [])

  useEffect(() => {
    updateScrollButtons()
    const tabsEl = tabsRef.current
    if (tabsEl) {
      tabsEl.addEventListener('scroll', updateScrollButtons)
      return () => tabsEl.removeEventListener('scroll', updateScrollButtons)
    }
  }, [tabs.length, activeTabId, updateScrollButtons])

  const scrollLeft = () => tabsRef.current?.scrollBy({ left: -200, behavior: 'smooth' })
  const scrollRight = () => tabsRef.current?.scrollBy({ left: 200, behavior: 'smooth' })

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50')
    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (tabId !== draggedTabId) setDragOverTabId(tabId)
  }

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (draggedTabId && draggedTabId !== targetTabId) {
      const fromIndex = tabs.findIndex((t) => t.id === draggedTabId)
      const toIndex = tabs.findIndex((t) => t.id === targetTabId)
      if (fromIndex !== -1 && toIndex !== -1) reorderTabs(fromIndex, toIndex)
    }
    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) navigate(tab.path)
  }

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const wasActive = activeTabId === tabId
    closeTab(tabId)
    if (wasActive) {
      const next = useTabStore.getState().getActiveTab()
      if (next) navigate(next.path)
    }
  }

  const handleConfirmOpen = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (pendingNav) {
      navigate(pendingNav.path)
    }
    setAddModalOpen(false)
    setPendingNav(null)
  }

  return (
    <>
      <div
        ref={containerRef}
        className="h-[40px] shrink-0 bg-topbar-bg border-b border-topbar-border flex items-center px-2"
        role="tablist"
        aria-label="Workspace tabs"
        data-testid="tabbar"
      >
        <button
          onClick={scrollLeft}
          disabled={!showLeftScroll}
          className={cn(
            'p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors',
            'disabled:opacity-40 disabled:pointer-events-none',
            'lg:hidden'
          )}
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div ref={tabsRef} className="flex-1 flex items-center overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-1 px-1 min-w-max">
            {tabs.map((tab) => {
              const Icon = iconMap[tab.icon ?? ''] ?? LayoutDashboard
              return (
                <div key={tab.id} className="relative flex items-center group">
                  <button
                    onClick={() => handleTabClick(tab.id)}
                    onDragStart={(e) => handleDragStart(e, tab.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, tab.id)}
                    onDrop={(e) => handleDrop(e, tab.id)}
                    draggable
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors relative pr-7 border-t border-x border-transparent',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1',
                      tab.id === activeTabId
                        ? 'bg-bg-primary text-text-primary border-border-primary -mb-px z-10 font-bold'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                      dragOverTabId === tab.id && 'bg-brand-primary-light'
                    )}
                    role="tab"
                    aria-selected={tab.id === activeTabId}
                    id={`${tab.id}-tab`}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', tab.id === activeTabId ? 'text-brand-primary' : 'text-text-tertiary')} />
                    <span className="truncate max-w-[160px]">{tab.title}</span>
                  </button>
                  {tab.closable && (
                    <button
                      onClick={(e) => handleTabClose(e, tab.id)}
                      aria-label={`Close ${tab.title}`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-bg-active text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => {
                setPendingNav(openableNavItems[0] ?? null)
                setAddModalOpen(true)
              }}
              className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-dashed border-border-secondary transition-colors cursor-pointer"
              aria-label="New tab"
              title="Open a new tab"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <button
          onClick={scrollRight}
          disabled={!showRightScroll}
          className={cn(
            'p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors',
            'disabled:opacity-40 disabled:pointer-events-none',
            'lg:hidden'
          )}
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <ModalPortal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Open a new tab">
        <div className="flex items-center justify-between pb-3 border-b border-border-primary mb-4">
          <div>
            <h2 className="text-base font-extrabold text-text-primary">Open New Tab</h2>
            <p className="text-xs text-text-tertiary">Pick a workbench page to open in a tab</p>
          </div>
          <button
            onClick={() => setAddModalOpen(false)}
            className="p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-bg-hover cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleConfirmOpen} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Page / View
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto scrollbar-thin">
              {getAllNavItems().map((item) => {
                const IconComp = iconMap[item.icon] ?? LayoutDashboard
                const isSelected = pendingNav?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPendingNav(item)}
                    disabled={!openableNavItems.some((n) => n.id === item.id)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all text-xs font-semibold',
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                        : 'bg-bg-tertiary/50 border-border-primary text-text-secondary hover:bg-bg-hover',
                      !openableNavItems.some((n) => n.id === item.id) && 'opacity-40 pointer-events-none'
                    )}
                  >
                    <IconComp className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-primary">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-text-secondary hover:bg-bg-hover rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!pendingNav}
              className="px-4 py-2 text-xs font-bold bg-brand-primary text-brand-accent-contrast rounded-xl hover:bg-brand-primary-hover shadow-xs disabled:opacity-50 cursor-pointer"
            >
              Open Tab
            </button>
          </div>
        </form>
      </ModalPortal>
    </>
  )
}
