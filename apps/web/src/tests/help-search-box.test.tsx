import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HelpSearchBox } from '../components/help/HelpSearchBox';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (key === 'help.searchResultsCount' && opts?.count !== undefined) {
        return opts.count === 1 ? '1 matching topic' : `${opts.count} matching topics`;
      }
      return key;
    },
  }),
}));

describe('HelpSearchBox', () => {
  it('exposes combobox semantics when the query is long enough', () => {
    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="eebus"
        searchResults={[
          { tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' },
          { tab: 'integration', title: 'EEBUS setup', body: 'Certificate pairing' },
        ]}
        onSelectResult={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 matching topics');
  });

  it('collapses the listbox for short queries', () => {
    render(
      <HelpSearchBox
        searchQuery="e"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="e"
        searchResults={[]}
        onSelectResult={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects a result from the listbox', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();

    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="eebus"
        searchResults={[{ tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' }]}
        onSelectResult={onSelectResult}
      />,
    );

    await user.click(screen.getByRole('option'));
    expect(onSelectResult).toHaveBeenCalledWith('lexicon');
  });

  it('announces no results via the live region', () => {
    render(
      <HelpSearchBox
        searchQuery="xyz"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="xyz"
        searchResults={[]}
        onSelectResult={vi.fn()}
      />,
    );

    const combobox = screen.getByRole('combobox');
    const noResults = screen.getByRole('note');
    expect(screen.getByRole('status')).toHaveTextContent('help.searchNoResults');
    expect(combobox).toHaveAttribute('aria-controls', noResults.id);
  });

  it('announces singular result count via the live region', () => {
    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="eebus"
        searchResults={[{ tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' }]}
        onSelectResult={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 matching topic');
  });

  it('navigates results with arrow keys and selects on Enter', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();

    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="eebus"
        searchResults={[
          { tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' },
          { tab: 'integration', title: 'EEBUS setup', body: 'Certificate pairing' },
        ]}
        onSelectResult={onSelectResult}
      />,
    );

    const combobox = screen.getByRole('combobox');
    const options = screen.getAllByRole('option');

    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(combobox).toHaveAttribute('aria-activedescendant', options[0].id);

    await user.click(combobox);
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(combobox).toHaveAttribute('aria-activedescendant', options[1].id);

    await user.keyboard('{Enter}');
    expect(onSelectResult).toHaveBeenCalledWith('integration');
  });

  it('dismisses the listbox on Escape without clearing the query', async () => {
    const user = userEvent.setup();
    const onSearchQueryChange = vi.fn();

    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={onSearchQueryChange}
        normalizedQuery="eebus"
        searchResults={[{ tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' }]}
        onSelectResult={vi.fn()}
      />,
    );

    const combobox = screen.getByRole('combobox');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(combobox);
    await user.keyboard('{Escape}');

    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(combobox).toHaveValue('eebus');
  });

  it('dismisses the empty-state popup on Escape', async () => {
    const user = userEvent.setup();

    render(
      <HelpSearchBox
        searchQuery="xyz"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="xyz"
        searchResults={[]}
        onSelectResult={vi.fn()}
      />,
    );

    const combobox = screen.getByRole('combobox');
    expect(screen.getByRole('note')).toBeInTheDocument();

    await user.click(combobox);
    await user.keyboard('{Escape}');

    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('ignores Enter and arrow keys after Escape dismisses a non-empty listbox', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();

    render(
      <HelpSearchBox
        searchQuery="eebus"
        onSearchQueryChange={vi.fn()}
        normalizedQuery="eebus"
        searchResults={[
          { tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' },
          { tab: 'integration', title: 'EEBUS setup', body: 'Certificate pairing' },
        ]}
        onSelectResult={onSelectResult}
      />,
    );

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');

    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');

    expect(onSelectResult).not.toHaveBeenCalled();
    expect(combobox).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('reopens the listbox after Escape when the query is edited back to the dismissed value', async () => {
    const user = userEvent.setup();

    const StatefulHelpSearch = () => {
      const [query, setQuery] = useState('eebus');
      return (
        <HelpSearchBox
          searchQuery={query}
          onSearchQueryChange={setQuery}
          normalizedQuery={query.trim().toLowerCase()}
          searchResults={[{ tab: 'lexicon', title: 'EEBUS', body: 'European energy interface' }]}
          onSelectResult={vi.fn()}
        />
      );
    };

    render(<StatefulHelpSearch />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.type(combobox, 'x');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Backspace}');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveValue('eebus');
  });
});
