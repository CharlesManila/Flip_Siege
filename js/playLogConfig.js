/**
 * Online play logging — finished games only.
 * Production deploy injects anon key via GitHub Secret SUPABASE_ANON_KEY.
 */
export const PLAY_LOG = {
  enabled: true,
  supabaseUrl: "https://wfjmrtogzfpkinivjipr.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmam1ydG9nemZwa2luaXZqaXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzM1ODgsImV4cCI6MjA5NTI0OTU4OH0.Az9LQ9iozCLUx09AFzc5lMk8cHjVlRUmYQepOQfEItc",
  table: "finished_games",
  webhookUrl: "",
  logLocalhost: false,
};
