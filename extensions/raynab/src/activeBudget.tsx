import { Icon, List, ActionPanel, Action, Color, showToast } from '@raycast/api';

import { BudgetSummary } from '@srcTypes';
import { useBudgets } from '@hooks/useBudgets';
import { useActiveBudget, useActiveBudgetCurrency } from '@hooks/useLocalValues';
import View from '@components/View';

export default function Command() {
  return (
    <View>
      <BudgetList />
    </View>
  );
}

function BudgetList() {
  const { data: budgets, isLoading } = useBudgets();

  const { activeBudgetId, setActiveBudgetId } = useActiveBudget();
  const { setActiveBudgetCurrency } = useActiveBudgetCurrency();

  const selectActiveBudget = (budget: BudgetSummary) => () => {
    setActiveBudgetId(budget.id ?? '');
    setActiveBudgetCurrency(budget.currency_format ?? null);

    const wasSelectedBudget = budget.id === activeBudgetId;

    if (wasSelectedBudget) {
      showToast({
        title: `"${budget.name}" is already the active budget`,
        message: 'Settings will be updated across Raynab.',
      });
    } else {
      showToast({
        title: `"${budget.name}" is now the active budget`,
        message: 'It will be used across all commands in Raynab.',
      });
    }
  };

  return (
    <List isLoading={isLoading}>
      {budgets?.map((budget) => (
        <BudgetItem
          key={budget.id}
          budget={budget}
          selectedId={activeBudgetId ?? ''}
          onToggle={selectActiveBudget(budget)}
        />
      ))}
    </List>
  );
}

function BudgetItem({
  budget,
  selectedId,
  onToggle,
}: {
  budget: BudgetSummary;
  selectedId: string;
  onToggle: () => void;
}) {
  return (
    <List.Item
      icon={Icon.Document}
      title={budget.name}
      accessories={[
        { icon: budget.id === selectedId ? { source: Icon.Checkmark, tintColor: Color.Green } : Icon.Circle },
      ]}
      actions={
        <ActionPanel title="Inspect Budget">
          <Action title="Select Budget" onAction={onToggle} />
        </ActionPanel>
      }
    />
  );
}
