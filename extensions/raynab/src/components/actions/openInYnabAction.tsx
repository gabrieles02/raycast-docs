import { Action } from '@raycast/api';
import { Shortcuts, URLs } from '@constants';
import { useActiveBudget } from '@hooks/useLocalValues';

interface OpenInYnabActionProps {
  accounts?: boolean;
  accountId?: string;
  yearMonth?: string;
}

export function OpenInYnabAction(props: OpenInYnabActionProps) {
  const { activeBudgetId } = useActiveBudget();

  const constructUrl = (budgetId: string, { accounts, accountId, yearMonth } = props) => {
    const budgetPath = `${URLs.ynab}/${budgetId}/`;

    if (yearMonth) return budgetPath + yearMonth;

    if (accounts) return `${budgetPath}/accounts/${accountId ?? ''}`;

    return budgetPath;
  };

  return (
    <Action.OpenInBrowser
      title={`Open ${props.accounts ? `Account${props.accountId ? '' : 's'}` : 'Budget'} In YNAB`}
      url={constructUrl(activeBudgetId, props)}
      shortcut={Shortcuts.ViewInBrowser}
    />
  );
}
