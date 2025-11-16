// validators.js
export const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('Au moins 8 caracteres.');
  if (!/[A-Z]/.test(password)) errors.push('Au moins une lettre majuscule.');
  if (!/[a-z]/.test(password)) errors.push('Au moins une lettre minuscule.');
  if (!/[0-9]/.test(password)) errors.push('Au moins un chiffre.');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('Au moins un caractere special.');
  return errors;
};
