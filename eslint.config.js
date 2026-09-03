'use strict';
const js = require('@eslint/js');
const security = require('eslint-plugin-security');

module.exports = [
  { ignores: ['node_modules/**', 'public/js/vendor/**'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        // Node
        require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
        console: 'writable', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        // Browser
        window: 'writable', document: 'writable', navigator: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', fetch: 'readonly', FormData: 'readonly', URLSearchParams: 'readonly',
        location: 'writable', history: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
        CustomEvent: 'readonly', DOMParser: 'readonly',
        // متغيرات مشتركة بين ملفات السكربتات (تُعرَّف في ملف وتُستهلك في آخر)
        ALM: 'readonly', AdminAPI: 'readonly', Charts: 'readonly',
        Chart: 'readonly', L: 'readonly', DOMPurify: 'readonly',
        io: 'readonly', Cleave: 'readonly', Swiper: 'readonly', AOS: 'readonly',
        crypto: 'readonly', sessionStorage: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^(next|err|req|res|e)$' }],
      'no-empty': 'warn',
      'security/detect-object-injection': 'off', // أنماطنا تستخدم مفاتيح داخلية موثوقة
      'security/detect-non-literal-fs-filename': 'off', // مسارات مبنية من إعدادات الخادم فقط
      'security/detect-non-literal-regexp': 'off',
    },
  },
];
