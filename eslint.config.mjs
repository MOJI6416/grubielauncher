import tseslint from '@electron-toolkit/eslint-config-ts'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', '*.tsbuildinfo']
  },
  tseslint.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
      // Existing effects deliberately use refs and stable store setters to avoid
      // resubscription loops; dependency intent is covered by focused tests.
      'react-hooks/exhaustive-deps': 'off'
    }
  },
  {
    files: ['src/renderer/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/screens/*', '@renderer/screens/*'],
              message:
                'features must not depend on screens; move the shared piece into the feature or shared/'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/screens/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@renderer/screens/*'],
              message:
                'screens must not import each other; navigate between them instead'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/*',
                '**/screens/*',
                '**/entities/*',
                '@renderer/features/*',
                '@renderer/screens/*',
                '@renderer/entities/*'
              ],
              message: 'shared must not depend on domain layers'
            }
          ]
        }
      ]
    }
  }
)
