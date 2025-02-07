import { CurrencyFormat } from '@srcTypes';

import { createContext, useContext, type ReactNode } from 'react';
import { CategoriesViewAction, CategoriesViewState } from './viewReducer';
import { useActiveBudgetCurrency } from '@hooks/useLocalValues';

type CategoriesContextReturnValues = {
  toggleDetails: () => void;
  toggleProgress: () => void;
  state: CategoriesViewState;
  currency: CurrencyFormat;
};
const CategoriesContext = createContext<CategoriesContextReturnValues | null>(null);

export function CategoriesProvider({
  dispatch,
  state,
  children,
}: {
  dispatch: React.Dispatch<CategoriesViewAction>;
  state: CategoriesViewState;
  children: ReactNode;
}) {
  const toggleDetails = () => dispatch({ type: 'toggle', view: 'details' });
  const toggleProgress = () => dispatch({ type: 'toggle', view: 'progress' });

  const { activeBudgetCurrency } = useActiveBudgetCurrency();

  return (
    <CategoriesContext.Provider
      value={{
        toggleDetails,
        toggleProgress,
        state,
        currency: activeBudgetCurrency,
      }}
      children={children}
    />
  );
}

export function useCategories() {
  const value = useContext(CategoriesContext);

  if (!value) {
    throw new Error('useCategories must be used inside a CategoriesContext');
  }

  return value;
}
