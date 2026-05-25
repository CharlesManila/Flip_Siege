/**
 * Online play logging — finished games only.
 * Production deploy injects anon key via GitHub Secret SUPABASE_ANON_KEY.
 */
export const PLAY_LOG = {
  enabled: true,
  supabaseUrl: "https://wfjmrtogzfpkinivjipr.supabase.co",
  supabaseAnonKey: "",
  table: "finished_games",
  webhookUrl: "",
  logLocalhost: false,
};
