/**
 * Online play logging — finished games only.
 * Set up Supabase (see docs/PLAY_LOG_SETUP.md) then paste URL + anon key here.
 */
export const PLAY_LOG = {
  /** Master switch (still requires URL/key or webhook + player opt-in). */
  enabled: true,
  /** e.g. https://abcdefgh.supabase.co */
  supabaseUrl: "",
  /** Supabase anon public key (safe with insert-only RLS). */
  supabaseAnonKey: "",
  table: "finished_games",
  /** Optional: POST JSON to this URL instead of/in addition to Supabase. */
  webhookUrl: "",
  /** Set true to log games from localhost (for testing). */
  logLocalhost: false,
};
