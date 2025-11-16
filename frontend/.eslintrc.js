module.exports = {
  root: true,
  parser: "@babel/eslint-parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    requireConfigFile: false,
  },
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  extends: [
    "react-app",
    "eslint:recommended",
    "plugin:react/recommended",
  ],
  rules: {
    // ? Désactive le faux positif sur JSX conditionnels
    "no-unused-expressions": "off",

    // ? Autorise JSX dans les fichiers .js/.jsx
    "react/jsx-uses-react": "off",
    "react/react-in-jsx-scope": "off",

    // Optionnel : adoucit certaines règles de style
    "react/prop-types": "off",
  },
};
