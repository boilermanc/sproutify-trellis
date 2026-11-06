import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai@1.34.0';
import { createAIHandler } from './handler.mjs';

Deno.serve(createAIHandler({ createClient, GoogleGenAI, env: (name: string) => Deno.env.get(name) }));
