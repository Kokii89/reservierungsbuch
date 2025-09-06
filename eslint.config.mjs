// eslint.config.mjs
import next from 'eslint-config-next';

export default [
  // Basis-Konfig von Next (Flat Config)
  ...next,

  // Deine Projektregeln (kommen NACH next, überschreiben also)
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^(toRow|_.*)$' }
      ],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];