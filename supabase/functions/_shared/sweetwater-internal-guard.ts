// Shared boundary: Sweetwater clients never enter internal service-role handlers.
export async function requireInternalUser(req: Request): Promise<Response | null> {
 if(req.method==="OPTIONS") return null;
 const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json"};
 const deny=()=>new Response(JSON.stringify({error:"Internal staff access required"}),{status:403,headers:cors});
 try{
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const url=Deno.env.get("SUPABASE_URL")||"";
  const token=req.headers.get("authorization")?.replace(/^Bearer /i,"")||"";
  if(key&&token===key)return null;
  if(!token||!key||!url)return deny();
  const headers={apikey:key,Authorization:"Bearer "+token};
  const response=await fetch(url+"/auth/v1/user",{headers});
  if(!response.ok)return deny();
  const user=await response.json();
  if(user.role!=="authenticated"||!user.id)return deny();
  const adminHeaders={apikey:key,Authorization:"Bearer "+key};
  const [trellis,sweetwater]=await Promise.all([
   fetch(url+"/rest/v1/trellis_users?select=id&auth_user_id=eq."+encodeURIComponent(user.id)+"&status=eq.active",{headers:adminHeaders}),
   fetch(url+"/rest/v1/rpc/sw_signalscout_can_access",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:"{}"})
  ]);
  if(trellis.ok&&(await trellis.json()).length)return null;
  if(sweetwater.ok&&(await sweetwater.json())===true)return null;
  return deny();
 }catch{return deny();}
}
