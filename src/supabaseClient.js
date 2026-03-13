/**
 * Supabase Client Configuration
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fxhuuabgzttozxgxczil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4aHV1YWJnenR0b3p4Z3hjemlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDk5NzUsImV4cCI6MjA4ODkyNTk3NX0.fslBP98cKeJH3AwGOEnOOhWgGCc7LdmFTCutDheZUEc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
