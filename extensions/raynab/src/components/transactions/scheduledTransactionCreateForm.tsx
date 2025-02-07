import {
  autoDistribute,
  easyGetColorFromId,
  formatToReadableFrequency,
  formatToYnabAmount,
  getSubtransacionCategoryname,
  time,
} from '@lib/utils';
import {
  ActionPanel,
  Action,
  Form,
  Icon,
  Color,
  showToast,
  Toast,
  confirmAlert,
  Alert,
  getPreferenceValues,
} from '@raycast/api';
import { createScheduledTransaction } from '@lib/api';
import { useAccounts } from '@hooks/useAccounts';
import { useCategoryGroups } from '@hooks/useCategoryGroups';
import { nanoid as random } from 'nanoid';

import { TransactionFlagColor, ScheduledTransactionFrequency } from 'ynab';
import { SaveSubTransactionWithReadableAmounts } from '@srcTypes';
import { useMemo, useState } from 'react';
import { FormValidation, useForm } from '@raycast/utils';
import { useActiveBudget, useActiveBudgetCurrency } from '@hooks/useLocalValues';

const FREQUENCY_OPTIONS = [
  'never',
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const satisfies ScheduledTransactionFrequency[];

const preferences = getPreferenceValues<Preferences>();

interface FormValues {
  date: Date | null;
  account_id: string;
  amount: string;
  payee_name?: string;
  payee_id?: string;
  memo?: string;
  flag_color?: string;
  categoryList?: string[];
  frequency: string;
  subtransactions?: SaveSubTransactionWithReadableAmounts[];
}

export function ScheduleTransactionCreateForm({ categoryId, accountId }: { categoryId?: string; accountId?: string }) {
  const { activeBudgetCurrency } = useActiveBudgetCurrency();
  const { activeBudgetId } = useActiveBudget();

  const { data: accounts = [], isLoading: isLoadingAccounts } = useAccounts(activeBudgetId);
  const { data: categoryGroups, isLoading: isLoadingCategories } = useCategoryGroups(activeBudgetId);
  const categories = categoryGroups?.flatMap((group) => group.categories);

  const [categoryList, setCategoryList] = useState([categoryId ?? '']);
  const [subtransactions, setSubtransactions] = useState<SaveSubTransactionWithReadableAmounts[]>([]);
  const [amount, setAmount] = useState('0');

  const [isTransfer, setisTransfer] = useState(false);
  const [transferFrom, setTransferTo] = useState('');

  const possibleAccounts = useMemo(() => {
    return accounts
      .filter((account) => {
        if (isTransfer) {
          return account.transfer_payee_id !== transferFrom;
        }
        return true;
      })
      .map((account) => <Form.Dropdown.Item key={account?.id ?? random()} value={account?.id} title={account?.name} />);
  }, [accounts, isTransfer, transferFrom]);

  const currencySymbol = activeBudgetCurrency?.currency_symbol;
  const tomorrow = time().add(1, 'day').toDate();

  const { handleSubmit, itemProps } = useForm<FormValues>({
    initialValues: {
      date: tomorrow,
      account_id: accountId,
      categoryList: categoryList,
      frequency: ScheduledTransactionFrequency.Never.toString(),
      payee_name: '',
      flag_color: '',
      payee_id: undefined,
    },
    onSubmit: async (values) => {
      const transactionData = {
        ...values,
        date: (values.date ?? tomorrow).toISOString(),
        amount: formatToYnabAmount(values.amount),
        approved: true,
        /* If there's a payee id, that means it's a transfer for which the payee is the transfer from account and the category doesn't matter */
        category_id: values.payee_id ? null : values.categoryList?.[0] || undefined,
        payee_name: values.payee_id ? undefined : values.payee_name,
        flag_color: values.flag_color
          ? TransactionFlagColor[values.flag_color as keyof typeof TransactionFlagColor]
          : null,
        subtransactions: undefined,
        categoryList: undefined,
        frequency: values.frequency as ScheduledTransactionFrequency,
      };

      /**
       * We need make sure the total of subtransactions is equal to the transaction.
       * That validation makes sense to keep at this level
       * */
      if (subtransactions.length > 0) {
        transactionData.category_id = undefined;

        /* @ts-expect-error we're not allowing updates to existing subtransactions so this doesn't matter */
        transactionData.subtransactions = subtransactions.map((s) => ({ ...s, amount: formatToYnabAmount(s.amount) }));

        const subtransactionsTotal = subtransactions.reduce((total, { amount }) => total + +amount, 0);
        const difference = subtransactionsTotal - +values.amount;

        if (difference !== 0) {
          const options: Alert.Options = {
            title: `Something Doesn't Add Up`,
            message: `The total is ${
              values.amount
            }, but the splits add up to ${subtransactionsTotal}. How would you like to handle the unassigned ${difference.toFixed(
              2,
            )}?`,
            primaryAction: {
              title: 'Auto-Distribute the amounts',
              onAction: () => {
                const distributedAmounts = autoDistribute(+values.amount, subtransactions.length).map((amount) =>
                  amount.toString(),
                );
                setSubtransactions(subtransactions.map((s, idx) => ({ ...s, amount: distributedAmounts[idx] })));
              },
            },
            dismissAction: {
              title: 'Adjust manually',
            },
          };
          await confirmAlert(options);
          return;
        }
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: 'Scheduling Transaction' });

      createScheduledTransaction(activeBudgetId, transactionData)
        .then(() => {
          toast.style = Toast.Style.Success;
          toast.title = 'Transaction scheduled successfully';
        })
        .catch(() => {
          toast.style = Toast.Style.Failure;
          toast.title = 'Failed to schedule transaction';
        });
    },
    validation: {
      date: FormValidation.Required,
      frequency: FormValidation.Required,
      payee_name: (value) => {
        if (!value && !isTransfer) {
          return 'Please add a counterparty';
        }
      },
      amount: FormValidation.Required,
      categoryList: (value) => {
        const errorMessage = 'Please add one or more categories to this transaction';

        if (isTransfer) return;

        if (!value) {
          return errorMessage;
        }
        if (value?.length === 0 && subtransactions.length === 0) return errorMessage;
      },
    },
  });

  const onSubcategoryAmountChange = (
    sub: SaveSubTransactionWithReadableAmounts,
  ): ((newValue: string) => void) | undefined => {
    const eventHandler = (newAmount: string) => {
      const oldList = [...subtransactions];
      const previousSubtransactionIdx = oldList.findIndex((s) => s.category_id === sub.category_id);

      if (previousSubtransactionIdx === -1) return;

      const newSubtransaction = { ...oldList[previousSubtransactionIdx], amount: newAmount };
      const newList = [...oldList];
      newList[previousSubtransactionIdx] = newSubtransaction;

      // If there are exactly 2 subtransactions, we can automatically calculate the second amount
      // based on the total transaction amount and the first subtransaction amount
      const isDualSplitTransaction = oldList.length === 2;
      if (isDualSplitTransaction && preferences.liveDistribute) {
        const otherSubTransactionIdx = previousSubtransactionIdx === 0 ? 1 : 0;
        const otherSubTransaction = { ...oldList[otherSubTransactionIdx] };
        const otherAmount = +amount - +newAmount;

        if (!Number.isNaN(otherAmount)) {
          otherSubTransaction.amount = otherAmount.toString();
          newList[otherSubTransactionIdx] = otherSubTransaction;
        }
      }

      setSubtransactions(newList);
    };

    return eventHandler;
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit" onSubmit={handleSubmit} />
        </ActionPanel>
      }
      navigationTitle="Create transaction"
      isLoading={isLoadingAccounts || isLoadingCategories}
    >
      <Form.Description
        title="Schedule a new transaction"
        text="Enter your transaction details below. Amounts can be positive or negative."
      />
      <Form.DatePicker
        {...itemProps.date}
        title="Date of Transaction"
        type={Form.DatePicker.Type.Date}
        min={tomorrow}
        info="Date of first occurence"
      />
      <Form.TextField
        {...itemProps.amount}
        title={`Amount ${currencySymbol ? `(${currencySymbol})` : ''}`}
        value={amount}
        onChange={setAmount}
      />
      <Form.Dropdown {...itemProps.frequency} title="Repeats">
        {FREQUENCY_OPTIONS.map((frequency) => (
          <Form.Dropdown.Item key={frequency} value={frequency} title={formatToReadableFrequency(frequency, false)} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox id="transfer" label="The transaction is a transfer" value={isTransfer} onChange={setisTransfer} />
      {isTransfer ? (
        <Form.Dropdown {...itemProps.payee_id} title="Transfer from" value={transferFrom} onChange={setTransferTo}>
          {accounts.map((account) => (
            <Form.Dropdown.Item
              key={account?.id ?? random()}
              value={account?.transfer_payee_id ?? ''}
              title={account?.name}
            />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField {...itemProps.payee_name} title="Payee Name" placeholder="Enter the counterparty" />
      )}
      <Form.Dropdown {...itemProps.account_id} title={isTransfer ? 'To' : 'Account'} defaultValue={accountId}>
        {possibleAccounts}
      </Form.Dropdown>
      {!isTransfer ? (
        <Form.TagPicker
          {...itemProps.categoryList}
          title="Category"
          value={categoryList}
          onChange={(newCategories) => {
            if (newCategories.length > 1) {
              const distributedAmounts = autoDistribute(+amount, newCategories.length).map((amount) =>
                amount.toString(),
              );
              setCategoryList(newCategories);
              setSubtransactions(
                newCategories.map((c, idx) => ({ category_id: c ?? '', amount: distributedAmounts[idx] })),
              );
            } else {
              setCategoryList(newCategories);
              setSubtransactions([]);
            }
          }}
        >
          {categories ? (
            categories.map((category, idx) => (
              <Form.TagPicker.Item
                key={category.id}
                value={category.id}
                title={category.name}
                icon={{ source: Icon.PlusCircle, tintColor: easyGetColorFromId(idx) }}
              />
            ))
          ) : (
            <Form.TagPicker.Item value="" title="" />
          )}
        </Form.TagPicker>
      ) : null}

      {subtransactions.length > 0 ? (
        <>
          <Form.Separator />
          {subtransactions.map((transaction, idx) => (
            <Form.TextField
              id={`subtransaction-${idx}`}
              key={transaction.category_id}
              title={getSubtransacionCategoryname(categories, transaction)}
              value={transaction.amount}
              onChange={onSubcategoryAmountChange(transaction)}
            />
          ))}
        </>
      ) : null}

      <Form.Separator />

      <Form.TextArea {...itemProps.memo} title="Memo" placeholder="Enter additional information…" />

      <Form.Dropdown {...itemProps.flag_color} title="Flag Color">
        <Form.Dropdown.Item value="" title="No Flag" icon={{ source: Icon.Dot }} />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Red.toString()}
          title="Red"
          icon={{ source: Icon.Dot, tintColor: Color.Red }}
        />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Orange.toString()}
          title="Orange"
          icon={{ source: Icon.Dot, tintColor: Color.Orange }}
        />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Yellow.toString()}
          title="Yellow"
          icon={{ source: Icon.Dot, tintColor: Color.Yellow }}
        />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Green.toString()}
          title="Green"
          icon={{ source: Icon.Dot, tintColor: Color.Green }}
        />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Blue.toString()}
          title="Blue"
          icon={{ source: Icon.Dot, tintColor: Color.Blue }}
        />
        <Form.Dropdown.Item
          value={TransactionFlagColor.Purple.toString()}
          title="Purple"
          icon={{ source: Icon.Dot, tintColor: Color.Purple }}
        />
      </Form.Dropdown>
    </Form>
  );
}
