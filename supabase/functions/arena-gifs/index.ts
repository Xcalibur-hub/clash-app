import {createGifHandler} from './handler.ts';
declare const Deno:{env:{get(n:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
Deno.serve(createGifHandler({url:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),providerKey:Deno.env.get('TENOR_API_KEY')}));
