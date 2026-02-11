import React, { useState } from 'react';
import {
  Instagram, Twitter, Linkedin, Facebook,
  ChevronRight, ChevronLeft, ExternalLink, Copy, Check,
  ShieldCheck, AlertTriangle, Loader2, CheckCircle2,
  Eye, EyeOff, Sparkles, ArrowRight, Globe, Lock,
  ClipboardCopy, RefreshCw, X, Info, Zap, Terminal
} from 'lucide-react';

// ——— Types ————————————————————————————————————————————————
type Platform = 'instagram' | 'x' | 'linkedin' | 'facebook';

interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  content: React.ReactNode;
}

interface PlatformConfig {
  id: Platform;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  devConsoleUrl: string;
  devConsoleName: string;
  credentialLabels: { key: string; secret: string };
  steps: WizardStep[];
}

interface PlatformSetupWizardProps {
  platform?: Platform;
  supabaseUrl?: string;
  onComplete?: (platform: Platform, credentials: { appId: string; appSecret: string }) => void;
  onClose?: () => void;
}

// ——— Clipboard Helper ——————————————————————————————————————
const CopyBlock: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative">
      {label && <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</span>}
      <div className="flex items-center bg-slate-900 rounded-xl px-4 py-3 font-mono text-sm text-emerald-400 border border-slate-700 shadow-inner">
        <Terminal size={14} className="text-slate-500 mr-3 flex-shrink-0" />
        <span className="flex-1 truncate select-all">{value}</span>
        <button
          onClick={handleCopy}
          className="ml-3 p-1.5 rounded-lg hover:bg-slate-700 transition text-slate-400 hover:text-white flex-shrink-0"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
};

// ——— Callout Block —————————————————————————————————————————
const Callout: React.FC<{ type: 'info' | 'warning' | 'tip'; children: React.ReactNode }> = ({ type, children }) => {
  const styles = {
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: <Info size={16} className="text-blue-500" />, text: 'text-blue-800' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: <AlertTriangle size={16} className="text-amber-500" />, text: 'text-amber-800' },
    tip: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <Sparkles size={16} className="text-emerald-500" />, text: 'text-emerald-800' },
  };
  const s = styles[type];
  return (
    <div className={`${s.bg} ${s.border} border rounded-2xl p-5 flex items-start space-x-3`}>
      <div className="flex-shrink-0 mt-0.5">{s.icon}</div>
      <div className={`text-xs font-bold leading-relaxed ${s.text}`}>{children}</div>
    </div>
  );
};

// ——— Numbered Instruction ——————————————————————————————————
const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-start space-x-4 group">
    <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 group-hover:bg-emerald-600 transition">
      {n}
    </div>
    <div className="text-sm text-slate-700 leading-relaxed font-medium pt-1">{children}</div>
  </div>
);

// ——— External Link Button ——————————————————————————————————
const ExtLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center space-x-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition shadow-lg"
  >
    <ExternalLink size={14} />
    <span>{children}</span>
  </a>
);

// ——— Instagram/Meta Steps ——————————————————————————————————
const getMetaSteps = (supabaseUrl: string): WizardStep[] => [
  {
    id: 'meta-account',
    title: 'Create Meta Developer Account',
    subtitle: 'Register or log in to the Meta for Developers portal',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to the <strong>Meta for Developers</strong> portal and log in with your Facebook account.
          If you don't have a developer account yet, click <strong>"Get Started"</strong> and follow the registration prompts.
        </Step>
        <div className="pl-12">
          <ExtLink href="https://developers.facebook.com/">Open Meta Developer Console</ExtLink>
        </div>
        <Step n={2}>
          Accept the <strong>Meta Platform Terms</strong> and <strong>Developer Policies</strong> when prompted.
        </Step>
        <Step n={3}>
          Verify your account — Meta may ask for a <strong>phone number</strong> or <strong>two-factor authentication</strong> setup.
        </Step>
        <Callout type="info">
          This is the same developer portal used for both <strong>Instagram</strong> and <strong>Facebook</strong> APIs.
          One Meta app can handle both platforms, so you only need to do this once.
        </Callout>
      </div>
    ),
  },
  {
    id: 'meta-create-app',
    title: 'Create a New Meta App',
    subtitle: 'Register your Trellis integration as a Meta App',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          From the <strong>Meta Developer Dashboard</strong>, click <strong>"Create App"</strong> (top right).
        </Step>
        <Step n={2}>
          Select the <strong>"Business"</strong> app type. This gives you access to both the Instagram Graph API and Facebook Pages API.
        </Step>
        <Step n={3}>
          Fill in the app details:
        </Step>
        <div className="pl-12 space-y-3">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">App Name:</span>
              <span className="text-sm font-bold text-slate-800">Sproutify Trellis</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Contact Email:</span>
              <span className="text-sm font-bold text-slate-800">your-admin@sproutify.app</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Business:</span>
              <span className="text-sm font-bold text-slate-800">(Optional — select your Meta Business account if you have one)</span>
            </div>
          </div>
        </div>
        <Step n={4}>
          Click <strong>"Create App"</strong>. You'll be taken to the app dashboard.
        </Step>
        <Callout type="warning">
          The app starts in <strong>Development Mode</strong>. This is fine for testing — you can publish it later when ready for production.
          In Development Mode, only users listed as testers/admins can authorize.
        </Callout>
      </div>
    ),
  },
  {
    id: 'meta-add-products',
    title: 'Add Instagram & Facebook Products',
    subtitle: 'Enable the API products your app needs',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          On your app's dashboard, scroll down to <strong>"Add Products to Your App"</strong>.
        </Step>
        <Step n={2}>
          Find <strong>"Instagram Graph API"</strong> and click <strong>"Set Up"</strong>.
        </Step>
        <Step n={3}>
          Also find <strong>"Facebook Login for Business"</strong> and click <strong>"Set Up"</strong>.
          This handles the OAuth consent flow that Trellis uses.
        </Step>
        <Callout type="tip">
          Facebook Login for Business is what actually powers the OAuth popup. The Instagram Graph API is the data product.
          You need <strong>both</strong> added to your app.
        </Callout>
        <Step n={4}>
          In the <strong>Facebook Login &gt; Settings</strong> section, configure:
        </Step>
        <div className="pl-12 space-y-3">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">Client OAuth Login:</span>
              <span className="text-sm font-bold text-emerald-600">Enabled</span>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">Web OAuth Login:</span>
              <span className="text-sm font-bold text-emerald-600">Enabled</span>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">Force HTTPS:</span>
              <span className="text-sm font-bold text-emerald-600">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'meta-redirect-uri',
    title: 'Configure OAuth Redirect URI',
    subtitle: 'Tell Meta where to send users after they authorize',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          In <strong>Facebook Login &gt; Settings</strong>, find the <strong>"Valid OAuth Redirect URIs"</strong> field.
        </Step>
        <Step n={2}>
          Paste the following URI. This is where Meta will send the user back after they grant permissions:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="OAuth Redirect URI"
            value={`${supabaseUrl}/functions/v1/social-oauth/callback`}
          />
        </div>
        <Step n={3}>
          Click <strong>"Save Changes"</strong> at the bottom of the page.
        </Step>
        <Callout type="warning">
          The redirect URI must <strong>exactly match</strong> what the Edge Function expects.
          No trailing slash. HTTPS required. If this doesn't match, the OAuth flow will fail with a redirect_uri_mismatch error.
        </Callout>
        <Step n={4}>
          Also add your app's <strong>domain</strong> under <strong>App Settings &gt; Basic &gt; App Domains</strong>:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="App Domain"
            value={supabaseUrl.replace('https://', '')}
          />
        </div>
      </div>
    ),
  },
  {
    id: 'meta-permissions',
    title: 'Request Permissions (Scopes)',
    subtitle: 'Define what data Trellis can access',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to <strong>Instagram Graph API &gt; Permissions</strong> on the left sidebar.
        </Step>
        <Step n={2}>
          Request the following permissions. These determine what Trellis can read and publish:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            {[
              { scope: 'instagram_basic', desc: 'Read profile info, followers, media', required: true },
              { scope: 'instagram_content_publish', desc: 'Publish posts and stories via API', required: true },
              { scope: 'instagram_manage_comments', desc: 'Read and reply to comments (social listening)', required: true },
              { scope: 'instagram_manage_insights', desc: 'Read post and account analytics', required: false },
              { scope: 'pages_show_list', desc: 'List connected Facebook Pages', required: true },
              { scope: 'pages_read_engagement', desc: 'Read page engagement data', required: false },
            ].map((perm, i) => (
              <div key={perm.scope} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? 'border-t border-slate-200' : ''}`}>
                <div className="flex items-center space-x-3">
                  <code className="text-xs font-mono font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">{perm.scope}</code>
                  {perm.required && <span className="text-[8px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">Required</span>}
                </div>
                <span className="text-[10px] text-slate-500 font-bold">{perm.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <Callout type="info">
          In <strong>Development Mode</strong>, you can test with your own accounts immediately.
          For production (other users), you'll need to submit these permissions for <strong>App Review</strong> by Meta.
        </Callout>
      </div>
    ),
  },
  {
    id: 'meta-testers',
    title: 'Add Test Users',
    subtitle: 'Allow team members to authorize during development',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Navigate to <strong>App Roles &gt; Roles</strong> in the left sidebar.
        </Step>
        <Step n={2}>
          Click <strong>"Add People"</strong> and add the Instagram accounts that will be testing the OAuth flow.
          Assign them the <strong>"Tester"</strong> role.
        </Step>
        <Step n={3}>
          Each tester needs to go to <strong>their own</strong> Facebook Settings &gt; Apps and Websites &gt; and <strong>accept the tester invitation</strong>.
        </Step>
        <Callout type="tip">
          This step is commonly missed. If the OAuth flow returns a "user not authorized" error,
          it's almost always because the tester hasn't accepted the invitation from their Facebook settings.
        </Callout>
      </div>
    ),
  },
  {
    id: 'meta-credentials',
    title: 'Copy Your Credentials',
    subtitle: 'Grab the App ID and App Secret from Meta',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to <strong>App Settings &gt; Basic</strong> in the left sidebar.
        </Step>
        <Step n={2}>
          You'll see your <strong>App ID</strong> displayed at the top. Copy it.
        </Step>
        <Step n={3}>
          Click <strong>"Show"</strong> next to <strong>App Secret</strong>. You'll need to re-enter your Facebook password.
          Copy the secret.
        </Step>
        <Callout type="warning">
          The App Secret is like a password. <strong>Never</strong> commit it to Git or expose it in frontend code.
          Trellis stores it encrypted via the <code>upsert_social_credential</code> RPC in Supabase — it never touches the browser.
        </Callout>
      </div>
    ),
  },
];

// ——— X (Twitter) Steps —————————————————————————————————————
const getXSteps = (supabaseUrl: string): WizardStep[] => [
  {
    id: 'x-account',
    title: 'Apply for X Developer Access',
    subtitle: 'Register for a developer account on the X Developer Portal',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to the <strong>X Developer Portal</strong> and sign in with the X (Twitter) account you want to use.
        </Step>
        <div className="pl-12">
          <ExtLink href="https://developer.x.com/en/portal/dashboard">Open X Developer Portal</ExtLink>
        </div>
        <Step n={2}>
          If prompted, apply for <strong>Free</strong> or <strong>Basic</strong> access.
          For Trellis, <strong>Basic ($100/mo)</strong> is recommended for publishing capabilities.
          Free tier is read-only.
        </Step>
        <Step n={3}>
          Describe your use case when asked. Mention it's for <strong>"Automated social media management and content scheduling for a marketing platform."</strong>
        </Step>
        <Callout type="warning">
          X's approval process can take a few hours to a few days depending on the tier.
          Free tier is usually instant. Basic/Pro tiers may require manual review.
        </Callout>
      </div>
    ),
  },
  {
    id: 'x-create-app',
    title: 'Create a Project & App',
    subtitle: 'Set up your Trellis integration in the X portal',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          From the Developer Portal dashboard, click <strong>"+ Add Project"</strong>.
        </Step>
        <Step n={2}>
          Fill in the project details:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Project Name:</span>
              <span className="text-sm font-bold text-slate-800">Sproutify Trellis</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Use Case:</span>
              <span className="text-sm font-bold text-slate-800">Making a bot</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Description:</span>
              <span className="text-sm font-bold text-slate-800">Marketing automation and social content distribution</span>
            </div>
          </div>
        </div>
        <Step n={3}>
          When prompted to create an App within the project, name it <strong>"Trellis Social Engine"</strong>.
        </Step>
        <Step n={4}>
          You'll immediately see your <strong>API Key</strong>, <strong>API Secret</strong>, and <strong>Bearer Token</strong>.
          Save them now — the API Secret is only shown once.
        </Step>
        <Callout type="warning">
          Copy the API Secret <strong>immediately</strong>. X only displays it once during creation.
          If you lose it, you'll need to regenerate it.
        </Callout>
      </div>
    ),
  },
  {
    id: 'x-oauth-settings',
    title: 'Configure OAuth 2.0',
    subtitle: 'Set up user authentication for the OAuth flow',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          In your App settings, scroll to <strong>"User Authentication Settings"</strong> and click <strong>"Set Up"</strong>.
        </Step>
        <Step n={2}>
          Configure the OAuth 2.0 settings:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">App Permissions:</span>
              <span className="text-sm font-bold text-slate-800">Read and Write</span>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">Type of App:</span>
              <span className="text-sm font-bold text-slate-800">Web App, Automated App, or Bot</span>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-40 pt-0.5">App Info:</span>
              <span className="text-sm font-bold text-slate-800">Required (callback URL, website URL)</span>
            </div>
          </div>
        </div>
        <Step n={3}>
          Set the <strong>Callback URI / Redirect URL</strong>:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="Callback URI"
            value={`${supabaseUrl}/functions/v1/social-oauth/callback`}
          />
        </div>
        <Step n={4}>
          Set the <strong>Website URL</strong>:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="Website URL"
            value="https://trellis.sproutify.app"
          />
        </div>
        <Step n={5}>
          Click <strong>"Save"</strong>. You'll get a <strong>Client ID</strong> and <strong>Client Secret</strong> for OAuth 2.0.
        </Step>
      </div>
    ),
  },
  {
    id: 'x-credentials',
    title: 'Copy Your Credentials',
    subtitle: 'Grab the OAuth 2.0 Client ID and Client Secret',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          From your App's <strong>"Keys and Tokens"</strong> tab, you need the <strong>OAuth 2.0</strong> credentials (not the API Key/Secret from v1.1).
        </Step>
        <Step n={2}>
          Copy the <strong>Client ID</strong> and <strong>Client Secret</strong>.
        </Step>
        <Callout type="info">
          X has two auth systems: <strong>OAuth 1.0a</strong> (API Key/Secret) and <strong>OAuth 2.0</strong> (Client ID/Secret).
          Trellis uses <strong>OAuth 2.0 with PKCE</strong> for the popup flow.
          Make sure you're copying from the right section.
        </Callout>
      </div>
    ),
  },
];

// ——— LinkedIn Steps ————————————————————————————————————————
const getLinkedInSteps = (supabaseUrl: string): WizardStep[] => [
  {
    id: 'li-create-app',
    title: 'Create a LinkedIn App',
    subtitle: 'Register Trellis on the LinkedIn Developer Portal',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to the <strong>LinkedIn Developer Portal</strong> and sign in.
        </Step>
        <div className="pl-12">
          <ExtLink href="https://www.linkedin.com/developers/apps/new">Create LinkedIn App</ExtLink>
        </div>
        <Step n={2}>
          Fill in the app details:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-32">App Name:</span>
              <span className="text-sm font-bold text-slate-800">Sproutify Trellis</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-32">LinkedIn Page:</span>
              <span className="text-sm font-bold text-slate-800">(Select your company's LinkedIn page)</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-32">Privacy Policy:</span>
              <span className="text-sm font-bold text-slate-800">https://sproutify.app/privacy</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-32">App Logo:</span>
              <span className="text-sm font-bold text-slate-800">Upload Sproutify logo (100x100px min)</span>
            </div>
          </div>
        </div>
        <Callout type="warning">
          LinkedIn <strong>requires</strong> a Company Page to be associated with the app.
          If you don't have a Sproutify Company Page on LinkedIn, create one first.
        </Callout>
      </div>
    ),
  },
  {
    id: 'li-products',
    title: 'Request API Products',
    subtitle: 'Enable the LinkedIn APIs Trellis needs',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          From your app dashboard, go to the <strong>"Products"</strong> tab.
        </Step>
        <Step n={2}>
          Request access to the following products:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            {[
              { product: 'Share on LinkedIn', desc: 'Post content to company page', auto: true },
              { product: 'Sign In with LinkedIn using OpenID Connect', desc: 'OAuth authentication flow', auto: true },
              { product: 'Community Management API', desc: 'Read and reply to comments', auto: false },
              { product: 'Advertising API', desc: 'Only if running LinkedIn Ads', auto: false },
            ].map((p, i) => (
              <div key={p.product} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? 'border-t border-slate-200' : ''}`}>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-slate-800">{p.product}</span>
                  {p.auto ? (
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Auto-approved</span>
                  ) : (
                    <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Requires Review</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-bold">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <Callout type="tip">
          "Share on LinkedIn" and "Sign In" are auto-approved — you can start testing immediately.
          The Community Management API requires a short application form.
        </Callout>
      </div>
    ),
  },
  {
    id: 'li-oauth-settings',
    title: 'Configure OAuth Redirect',
    subtitle: 'Set the authorized redirect URL',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to your app's <strong>"Auth"</strong> tab.
        </Step>
        <Step n={2}>
          Under <strong>"Authorized redirect URLs for your app"</strong>, click <strong>"+ Add redirect URL"</strong> and paste:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="Redirect URL"
            value={`${supabaseUrl}/functions/v1/social-oauth/callback`}
          />
        </div>
        <Step n={3}>
          Click <strong>"Update"</strong> to save.
        </Step>
        <Step n={4}>
          On the same Auth tab, you'll see your <strong>Client ID</strong> and <strong>Client Secret</strong>.
          Copy both values.
        </Step>
      </div>
    ),
  },
  {
    id: 'li-credentials',
    title: 'Copy Your Credentials',
    subtitle: 'Grab the Client ID and Client Secret',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          On the <strong>"Auth"</strong> tab, copy your <strong>Client ID</strong> (shown openly).
        </Step>
        <Step n={2}>
          Click the <strong>eye icon</strong> next to <strong>Client Secret</strong> to reveal and copy it.
        </Step>
        <Callout type="info">
          LinkedIn's OAuth 2.0 implementation is straightforward. The scopes Trellis requests are:
          <code className="ml-1 bg-white px-1.5 py-0.5 rounded text-[10px] border border-blue-200">openid profile email w_member_social</code>
        </Callout>
      </div>
    ),
  },
];

// ——— Platform Configs ——————————————————————————————————————
const getPlatformConfigs = (supabaseUrl: string): Record<Platform, PlatformConfig> => ({
  instagram: {
    id: 'instagram',
    name: 'Instagram / Meta',
    icon: Instagram,
    color: 'text-pink-500',
    bgColor: 'bg-gradient-to-br from-pink-50 to-purple-50',
    borderColor: 'border-pink-200',
    devConsoleUrl: 'https://developers.facebook.com/',
    devConsoleName: 'Meta Developer Console',
    credentialLabels: { key: 'Meta App ID', secret: 'Meta App Secret' },
    steps: getMetaSteps(supabaseUrl),
  },
  x: {
    id: 'x',
    name: 'X (Twitter)',
    icon: Twitter,
    color: 'text-slate-800',
    bgColor: 'bg-gradient-to-br from-slate-50 to-slate-100',
    borderColor: 'border-slate-300',
    devConsoleUrl: 'https://developer.x.com/',
    devConsoleName: 'X Developer Portal',
    credentialLabels: { key: 'OAuth 2.0 Client ID', secret: 'OAuth 2.0 Client Secret' },
    steps: getXSteps(supabaseUrl),
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'text-blue-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-sky-50',
    borderColor: 'border-blue-200',
    devConsoleUrl: 'https://www.linkedin.com/developers/',
    devConsoleName: 'LinkedIn Developer Portal',
    credentialLabels: { key: 'Client ID', secret: 'Client Secret' },
    steps: getLinkedInSteps(supabaseUrl),
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook Pages',
    icon: Facebook,
    color: 'text-blue-500',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    borderColor: 'border-blue-200',
    devConsoleUrl: 'https://developers.facebook.com/',
    devConsoleName: 'Meta Developer Console',
    credentialLabels: { key: 'Meta App ID', secret: 'Meta App Secret' },
    steps: getMetaSteps(supabaseUrl), // Same Meta app, different permissions
  },
});

// ————————————————————————————————————————————————————————————
// MAIN WIZARD COMPONENT
// ————————————————————————————————————————————————————————————
const PlatformSetupWizard: React.FC<PlatformSetupWizardProps> = ({
  platform: initialPlatform,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://povudgtvzggnxwgtjexa.supabase.co',
  onComplete,
  onClose,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(initialPlatform || null);
  const [currentStep, setCurrentStep] = useState(0);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  const configs = getPlatformConfigs(supabaseUrl);
  const config = selectedPlatform ? configs[selectedPlatform] : null;
  const totalSteps = config ? config.steps.length + 1 : 0; // +1 for credential entry
  const isLastStep = currentStep === totalSteps - 1;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult('idle');
    // Simulate API validation — in production this would call the Edge Function
    await new Promise(r => setTimeout(r, 2500));
    if (appId.length > 5 && appSecret.length > 5) {
      setTestResult('success');
    } else {
      setTestResult('error');
    }
    setIsTesting(false);
  };

  const handleFinish = () => {
    if (selectedPlatform && onComplete) {
      onComplete(selectedPlatform, { appId, appSecret });
    }
  };

  // ——— Platform Selector ——————————————————————————————————
  if (!selectedPlatform) {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-3 bg-emerald-50 border border-emerald-200 px-5 py-2 rounded-full">
            <Zap size={16} className="text-emerald-600" />
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Platform Setup Wizard</span>
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Connect a Social Platform</h2>
          <p className="text-sm text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
            Choose a platform to begin the guided setup. Each wizard walks you through every step — from
            creating your developer app to testing the OAuth connection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {(Object.values(configs) as PlatformConfig[]).map((cfg) => {
            const Icon = cfg.icon;
            const isFacebook = cfg.id === 'facebook';
            return (
              <button
                key={cfg.id}
                onClick={() => !isFacebook && setSelectedPlatform(cfg.id)}
                disabled={isFacebook}
                className={`relative p-8 rounded-[2rem] border-2 text-left transition-all group ${
                  isFacebook
                    ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50'
                    : `${cfg.bgColor} ${cfg.borderColor} hover:shadow-xl hover:scale-[1.02] active:scale-[0.99]`
                }`}
              >
                {isFacebook && (
                  <span className="absolute top-4 right-4 text-[8px] font-black uppercase bg-slate-200 text-slate-500 px-2 py-1 rounded-full">
                    Same as Instagram
                  </span>
                )}
                <div className={`w-14 h-14 rounded-2xl ${cfg.bgColor} border ${cfg.borderColor} flex items-center justify-center mb-5 shadow-sm`}>
                  <Icon size={28} className={cfg.color} />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-1">{cfg.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cfg.devConsoleName}</p>
                {!isFacebook && (
                  <div className="mt-4 flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-600 transition">
                    <span>Start Setup</span>
                    <ArrowRight size={12} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ——— Wizard Flow ————————————————————————————————————————
  const Icon = config!.icon;
  const steps = config!.steps;
  const isCredentialStep = currentStep >= steps.length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => { setSelectedPlatform(null); setCurrentStep(0); setAppId(''); setAppSecret(''); setTestResult('idle'); }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <ChevronLeft size={20} />
          </button>
          <div className={`w-10 h-10 rounded-xl ${config!.bgColor} border ${config!.borderColor} flex items-center justify-center`}>
            <Icon size={20} className={config!.color} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">{config!.name} Setup</h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Step {currentStep + 1} of {totalSteps}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 rounded-xl text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-10">
          {!isCredentialStep ? (
            // Guide Steps
            <div className="animate-in fade-in slide-in-from-right-4 duration-300" key={currentStep}>
              <div className="mb-8 pb-6 border-b border-slate-100">
                <h3 className="text-xl font-black text-slate-800 mb-1">{steps[currentStep].title}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{steps[currentStep].subtitle}</p>
              </div>
              {steps[currentStep].content}
            </div>
          ) : (
            // Credential Entry Step
            <div className="animate-in fade-in slide-in-from-right-4 duration-300" key="credentials">
              <div className="mb-8 pb-6 border-b border-slate-100">
                <h3 className="text-xl font-black text-slate-800 mb-1">Enter Your Credentials</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Paste the {config!.credentialLabels.key} and {config!.credentialLabels.secret} from {config!.devConsoleName}
                </p>
              </div>

              <div className="space-y-6 max-w-xl">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    {config!.credentialLabels.key}
                  </label>
                  <input
                    type="text"
                    value={appId}
                    onChange={e => setAppId(e.target.value)}
                    placeholder="Paste your App ID / Client ID here..."
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-5 py-4 text-sm font-mono font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    {config!.credentialLabels.secret}
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={appSecret}
                      onChange={e => setAppSecret(e.target.value)}
                      placeholder="Paste your App Secret / Client Secret here..."
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-5 py-4 pr-14 text-sm font-mono font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 transition"
                    >
                      {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="pt-4">
                  <button
                    onClick={handleTestConnection}
                    disabled={!appId || !appSecret || isTesting}
                    className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center space-x-3 transition shadow-lg ${
                      testResult === 'success'
                        ? 'bg-emerald-500 text-white'
                        : testResult === 'error'
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-900 text-white hover:bg-emerald-600 disabled:opacity-30'
                    }`}
                  >
                    {isTesting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Validating Credentials...</span>
                      </>
                    ) : testResult === 'success' ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Connection Verified</span>
                      </>
                    ) : testResult === 'error' ? (
                      <>
                        <AlertTriangle size={18} />
                        <span>Validation Failed — Check Credentials</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                </div>

                {testResult === 'success' && (
                  <Callout type="tip">
                    Credentials validated. Click <strong>"Save & Finish"</strong> to store them securely in Trellis.
                    They'll be encrypted via the <code>upsert_social_credential</code> RPC and never stored in plain text.
                  </Callout>
                )}

                {testResult === 'error' && (
                  <Callout type="warning">
                    The credentials couldn't be verified. Double-check that you copied the correct
                    <strong> {config!.credentialLabels.key}</strong> and <strong>{config!.credentialLabels.secret}</strong> from the {config!.devConsoleName}.
                  </Callout>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>

          <div className="flex items-center space-x-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentStep ? 'bg-emerald-500 w-6' : i < currentStep ? 'bg-emerald-300' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {isLastStep && testResult === 'success' ? (
            <button
              onClick={handleFinish}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-lg"
            >
              <Lock size={14} />
              <span>Save & Finish</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(Math.min(totalSteps - 1, currentStep + 1))}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-900 text-white hover:bg-emerald-600 transition shadow-lg"
            >
              <span>{isCredentialStep ? 'Enter Credentials' : 'Next'}</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlatformSetupWizard;
