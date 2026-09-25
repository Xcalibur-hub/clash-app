import React from 'react';

export interface SidebarState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const SidebarContext = React.createContext<SidebarState | null>(null);

/** Sidebar state owner — mounted once in the Arena tabs layout. */
export function SidebarProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const open = React.useCallback((): void => setIsOpen(true), []);
  const close = React.useCallback((): void => setIsOpen(false), []);
  const value = React.useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/** Drawer controls for the Arena sidebar (menu button, scrim, links). */
export function useSidebar(): SidebarState {
  const state = React.useContext(SidebarContext);
  if (!state) throw new Error('useSidebar must be used inside <SidebarProvider>.');
  return state;
}
