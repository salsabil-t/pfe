import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ykaufdjncnecsvmtrftm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYXVmZGpuY25lY3N2bXRyZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTc3MzksImV4cCI6MjA4NTI3MzczOX0.z4_o81wPqj8n8Csi-vK7gWVA4k7t0wweHiTwxNGDYxc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);