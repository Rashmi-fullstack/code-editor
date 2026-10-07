import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

console.log('Using URL:', url);
console.log('Has Service Role Key:', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data: profiles, error: pErr, count: pCount } = await client
    .from('profiles')
    .select('*', { count: 'exact' });
  console.log('Profiles query:', { pCount, pErr, profilesLength: profiles?.length, profiles });

  const { data: usersData, error: uErr } = await client.auth.admin?.listUsers() || { error: 'No admin client' };
  console.log('Admin listUsers:', { uErr, usersCount: usersData?.users?.length });

  const { data: projects, error: prErr } = await client.from('projects').select('id, name, user_id');
  console.log('Projects:', { prErr, projectsLength: projects?.length });
}

run().catch(console.error);
