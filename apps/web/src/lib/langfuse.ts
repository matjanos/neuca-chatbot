import { LangfuseWeb } from 'langfuse';

let langfuseWeb: LangfuseWeb | null = null;

export function getLangfuseWeb(): LangfuseWeb | null {
  const publicKey = import.meta.env.VITE_LANGFUSE_PUBLIC_KEY;

  if (!publicKey) {
    console.warn('LangFuse not configured - feedback disabled');
    return null;
  }

  if (!langfuseWeb) {
    langfuseWeb = new LangfuseWeb({
      publicKey,
      baseUrl: import.meta.env.VITE_LANGFUSE_HOST || 'https://cloud.langfuse.com',
    });
  }

  return langfuseWeb;
}
