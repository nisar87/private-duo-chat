// Fake invite function for the browser smoke test.
export const getFunctions = () => ({});
export const httpsCallable = () => async (data: { email: string }) => ({
  data: { link: `https://chat.example/#invite=e2e-code-${encodeURIComponent(data.email)}-0123456789`, expiresInMinutes: 60 },
});
