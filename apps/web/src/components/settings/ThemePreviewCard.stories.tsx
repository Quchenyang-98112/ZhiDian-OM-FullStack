import type { Meta, StoryObj } from '@storybook/react';
import { themeDefinitions, themeOrder } from '../../design-tokens';
import { ThemePreviewCard } from './ThemePreviewCard';

const firstTheme = themeDefinitions[themeOrder[0]];

const meta: Meta<typeof ThemePreviewCard> = {
  title: 'Settings/ThemePreviewCard',
  component: ThemePreviewCard,
  tags: ['autodocs'],
  args: { def: firstTheme },
  argTypes: { onClick: { action: 'selected' }, def: { control: false } },
};
export default meta;

type Story = StoryObj<typeof ThemePreviewCard>;

export const Inactive: Story = {
  args: { isActive: false },
};

export const Active: Story = {
  args: { isActive: true },
};

/** Every registered theme rendered side by side. */
export const AllThemes: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {themeOrder.map((name, i) => (
        <ThemePreviewCard
          key={name}
          def={themeDefinitions[name]}
          isActive={i === 0}
          onClick={() => {}}
        />
      ))}
    </div>
  ),
};
