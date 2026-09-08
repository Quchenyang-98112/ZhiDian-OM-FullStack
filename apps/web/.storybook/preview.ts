import type { Preview } from '@storybook/react';
import '../src/index.css';
import '../src/i18n';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: 'ocean-dark',
      values: [
        { name: 'ocean-dark', value: '#0a1628' },
        { name: 'energy-dark', value: '#0d0d0d' },
        { name: 'solar-light', value: '#fffdf5' },
        { name: 'nature-green', value: '#0a1a10' },
        { name: 'minimal-white', value: '#ffffff' },
      ],
    },
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: true }] } },
  },
  globalTypes: {
    locale: {
      description: 'i18n Locale',
      defaultValue: 'de',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'de', title: 'Deutsch' },
          { value: 'en', title: 'English' },
        ],
      },
    },
  },
};

export default preview;
