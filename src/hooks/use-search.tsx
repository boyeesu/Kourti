import * as React from 'react';

export type SearchContextValue = {
  term: string;
  setTerm: React.Dispatch<React.SetStateAction<string>>;
};

const SearchContext = React.createContext<SearchContextValue | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [term, setTerm] = React.useState('');
  const value = React.useMemo(() => ({ term, setTerm }), [term]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearch() {
  const context = React.useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
