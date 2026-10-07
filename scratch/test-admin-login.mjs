import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const client = createClient(url, anonKey);

async function testAuth() {
  const email = process.env.ADMIN_EMAILS;
  const password = process.env.ADMIN_PASSWORD;

  console.log('Testing sign in with:', email);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.log('Sign in error:', error);
  } else {
    console.log('Sign in success! User ID:', data.user?.id);
    const { data: profiles, error: pErr } = await client
      .from('profiles')
      .select('*');
    console.log('Profiles with auth session:', { pErr, count: profiles?.length, profiles });
  }
}

testAuth().catch(console.error);
