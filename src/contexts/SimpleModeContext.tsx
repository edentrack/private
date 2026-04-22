import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'edentrack_simple_mode';

interface SimpleModeContextType {
  simpleMode: boolean;
  toggleSimpleMode: () => void;
  setSimpleMode: (val: boolean) => void;
}

const SimpleModeContext = createContext<SimpleModeContextType>({
  simpleMode: false,
  toggleSimpleMode: () => {},
  setSimpleMode: () => {},
});

export function SimpleModeProvider({ children }: { children: ReactNode }) {
  const [simpleMode, setSimpleModeState] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const setSimpleMode = (val: boolean) => {
    setSimpleModeState(val);
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch {}
  };

  const toggleSimpleMode = () => setSimpleMode(!simpleMode);

  return (
    <SimpleModeContext.Provider value={{ simpleMode, toggleSimpleMode, setSimpleMode }}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode() {
  return useContext(SimpleModeContext);
}
