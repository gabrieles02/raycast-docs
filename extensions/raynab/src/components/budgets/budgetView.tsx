import { useBudget } from '@hooks/useBudget';
import { useCategoryGroups } from '@hooks/useCategoryGroups';
import { getCurrentMonth } from '@lib/utils';
import { List } from '@raycast/api';
import { CategoryGroupSection } from './categoryGroupSection';
import { useReducer } from 'react';
import { categoryViewReducer, initView } from './viewReducer';
import { CategoriesProvider } from './budgetContext';
import { useActiveBudget } from '@hooks/useLocalValues';

export function BudgetView() {
  const { activeBudgetId, isLoadingActiveBudgetId } = useActiveBudget();
  const { data: categoryGroups = [], isLoading: isLoadingCategories } = useCategoryGroups(activeBudgetId);
  const { data: budget, isLoading: isLoadingBudget } = useBudget(activeBudgetId);

  const [state, dispatch] = useReducer(
    categoryViewReducer,
    {
      isDetailed: false,
      isShowingProgress: false,
    },
    initView,
  );

  return (
    <CategoriesProvider state={state} dispatch={dispatch}>
      <List
        isLoading={isLoadingActiveBudgetId || isLoadingCategories || isLoadingBudget}
        searchBarPlaceholder={`Search categories in ${getCurrentMonth()}`}
        isShowingDetail={state.isDetailed}
      >
        {categoryGroups && categoryGroups?.length > 0 ? (
          <CategoryGroupSection categoryGroups={categoryGroups} budget={budget} />
        ) : (
          <List.EmptyView
            title="No Categories"
            description="We couldn't find any categories for your budget. Try opening YNAB and adding some."
          />
        )}
      </List>
    </CategoriesProvider>
  );
}
