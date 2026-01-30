import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ykaufdjncnecsvmtrftm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EUTlZwVs4cLbk2okxl8dig_j94ey3lu";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
