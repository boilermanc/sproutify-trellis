import React, { useState, useEffect, useCallback } from 'react';
import {
  Instagram, Twitter, Linkedin, Facebook, Music,
  ChevronRight, ChevronLeft, ExternalLink, Copy, Check,
  ShieldCheck, AlertTriangle, Loader2, CheckCircle2,
  Eye, EyeOff, Sparkles, ArrowRight, Globe, Lock,
  ClipboardCopy, RefreshCw, X, Info, Zap, Terminal, GitBranch, PlugZap,
  Plus, Trash2, RotateCcw, Unplug, Clock, Settings2, Youtube
} from 'lucide-react';
import { Branch, SocialPlatform, SocialConnectionStatus, BranchSocialAccountsMap } from '../types';
import { saveAppCredentials, openSocialOAuthPopup, checkConnections, disconnectPlatform, testConnection } from '../services/socialService';

// ——— Types ————————————————————————————————————————————————
type Platform = 'instagram' | 'x' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube';

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
  branches?: Branch[];
  branchSocialAccounts?: BranchSocialAccountsMap;
  // Preselect a branch (+ optionally platform) when launched to edit an existing connection.
  initialBranchId?: string;
  onComplete?: (platform: Platform, branchId: string) => void;
  onClose?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
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

// ——— TikTok Steps ——————————————————————————————————————————
const getTikTokSteps = (supabaseUrl: string): WizardStep[] => [
  {
    id: 'tiktok-account',
    title: 'Create a TikTok for Developers App',
    subtitle: 'Register Trellis on the TikTok for Developers portal',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          Go to <strong>TikTok for Developers</strong> and sign in with the TikTok account that will own the app.
        </Step>
        <div className="pl-12">
          <ExtLink href="https://developers.tiktok.com/">Open TikTok for Developers</ExtLink>
        </div>
        <Step n={2}>
          Click <strong>"Manage apps"</strong> then <strong>"Connect an app"</strong> and fill in the app details:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">App Name:</span>
              <span className="text-sm font-bold text-slate-800">Sproutify Trellis</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[9px] font-black text-slate-400 uppercase w-28">Category:</span>
              <span className="text-sm font-bold text-slate-800">Social Media Management / Marketing</span>
            </div>
          </div>
        </div>
        <Callout type="warning">
          A new TikTok app is <strong>unaudited</strong> by default. Read the next step carefully — unaudited apps
          have real, hard limits on what they can post before TikTok reviews the app.
        </Callout>
      </div>
    ),
  },
  {
    id: 'tiktok-products',
    title: 'Add Login Kit & Content Posting API',
    subtitle: 'Enable the products Trellis needs, and know the unaudited limits',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          From your app's dashboard, add the <strong>"Login Kit"</strong> product — this powers the OAuth popup Trellis uses to connect.
        </Step>
        <Step n={2}>
          Also add the <strong>"Content Posting API"</strong> product — this is what lets Trellis publish video and photo posts.
        </Step>
        <Step n={3}>
          Request the following scopes on the app:
        </Step>
        <div className="pl-12">
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            {[
              { scope: 'user.info.basic', desc: 'Read basic profile info (open_id, username, avatar)', required: true },
              { scope: 'video.publish', desc: 'Publish videos directly to the account', required: true },
              { scope: 'video.upload', desc: 'Upload video/photo content for posting', required: true },
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
        <Callout type="warning">
          <strong>Until this app passes TikTok's Content Posting API audit, every post it makes is forced to
          "SELF_ONLY" (private) visibility</strong> — it cannot post publicly. On top of that, the TikTok account
          being posted to must itself be set to private, and only <strong>5 users total can post through the app
          per 24 hours</strong>. If you try to publish a public post before the audit, TikTok rejects it with a
          <code className="mx-1 bg-white px-1.5 py-0.5 rounded text-[10px] border border-amber-200">403 unaudited_client_can_only_post_to_private_accounts</code>
          error. Plan for the audit before you rely on TikTok for real campaigns.
        </Callout>
      </div>
    ),
  },
  {
    id: 'tiktok-redirect',
    title: 'Configure the Redirect URI',
    subtitle: 'Tell TikTok where to send users after they authorize — and know the media-URL catch',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          In the <strong>Login Kit</strong> product settings, find <strong>"Redirect URI"</strong> and add:
        </Step>
        <div className="pl-12">
          <CopyBlock
            label="Redirect URI"
            value={`${supabaseUrl}/functions/v1/social-oauth/callback`}
          />
        </div>
        <Step n={2}>
          Save your changes. This is the same shared callback endpoint every platform in Trellis uses.
        </Step>
        <Callout type="warning">
          <strong>TikTok requires domain/URL ownership verification for any media URL it fetches during
          publishing.</strong> Supabase Storage URLs live on <code className="mx-1 bg-white px-1.5 py-0.5 rounded text-[10px] border border-amber-200">supabase.co</code>,
          a domain Trellis doesn't own and can't verify by DNS. Photo/video posting will not work until media is
          served from a domain we control — for example a <code className="mx-1 bg-white px-1.5 py-0.5 rounded text-[10px] border border-amber-200">media.sproutify.app</code> proxy
          in front of Storage. Connecting the account will still work without this, but publishing will fail
          until that proxy exists.
        </Callout>
      </div>
    ),
  },
  {
    id: 'tiktok-credentials',
    title: 'Copy Your Credentials',
    subtitle: 'Grab the Client Key and Client Secret from TikTok for Developers',
    content: (
      <div className="space-y-6">
        <Step n={1}>
          On your app's <strong>"Basic Information"</strong> tab, copy the <strong>Client Key</strong>.
        </Step>
        <Step n={2}>
          Reveal and copy the <strong>Client Secret</strong> next to it.
        </Step>
        <Callout type="info">
          TikTok's OAuth calls this <code className="bg-white px-1.5 py-0.5 rounded text-[10px] border border-blue-200">client_key</code>,
          not <code className="bg-white px-1.5 py-0.5 rounded text-[10px] border border-blue-200">client_id</code> like most other platforms.
          Trellis handles that naming difference for you — just paste the Client Key and Client Secret exactly as shown.
        </Callout>
      </div>
    ),
  },
];

// ——— YouTube Steps —————————————————————————————————————————
const getYouTubeSteps = (supabaseUrl: string): WizardStep[] => [
  {
    id: 'youtube-project',
    title: 'Enable the YouTube APIs',
    subtitle: 'Use a Google Cloud project owned by Rekkrd',
    content: (
      <div className="space-y-6">
        <Step n={1}>Open Google Cloud Console and select or create the project Trellis will use for Rekkrd publishing.</Step>
        <div className="pl-12"><ExtLink href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">Open YouTube Data API</ExtLink></div>
        <Step n={2}>Enable <strong>YouTube Data API v3</strong> and <strong>YouTube Analytics API</strong>.</Step>
        <Callout type="info">One Google OAuth client can be reused for both Rekkrd channels. Trellis stores a separate user token for each immutable YouTube channel ID.</Callout>
      </div>
    ),
  },
  {
    id: 'youtube-consent',
    title: 'Configure OAuth Consent',
    subtitle: 'Request upload and read-only analytics access',
    content: (
      <div className="space-y-6">
        <Step n={1}>Configure the OAuth consent screen for your Google Cloud project.</Step>
        <Step n={2}>During testing, add <strong>boilermanc@gmail.com</strong> as a test user.</Step>
        <Step n={3}>Trellis requests YouTube upload, YouTube read-only, and YouTube Analytics read-only scopes.</Step>
        <Callout type="warning">Google may show an unverified-app warning until the OAuth application completes verification. Keep the app in testing while connecting your own channels.</Callout>
      </div>
    ),
  },
  {
    id: 'youtube-client',
    title: 'Create a Web OAuth Client',
    subtitle: 'Register the account-scoped Trellis callback',
    content: (
      <div className="space-y-6">
        <Step n={1}>Under <strong>APIs &amp; Services → Credentials</strong>, create an OAuth Client ID with application type <strong>Web application</strong>.</Step>
        <Step n={2}>Add this exact authorized redirect URI:</Step>
        <div className="pl-12"><CopyBlock label="Authorized Redirect URI" value={`${supabaseUrl}/functions/v1/youtube-oauth/callback`} /></div>
        <Step n={3}>Copy the generated Client ID and Client Secret. You will enter them on the next screen.</Step>
        <Callout type="tip">During Google authorization, choose the Brand Account named for the specific channel selected in Trellis. Trellis independently verifies the returned channel ID before storing anything.</Callout>
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
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    icon: Music,
    color: 'text-slate-900',
    bgColor: 'bg-gradient-to-br from-slate-50 to-slate-100',
    borderColor: 'border-slate-300',
    devConsoleUrl: 'https://developers.tiktok.com/',
    devConsoleName: 'TikTok for Developers',
    credentialLabels: { key: 'Client Key', secret: 'Client Secret' },
    steps: getTikTokSteps(supabaseUrl),
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-600',
    bgColor: 'bg-gradient-to-br from-red-50 to-white',
    borderColor: 'border-red-200',
    devConsoleUrl: 'https://console.cloud.google.com/apis/credentials',
    devConsoleName: 'Google Cloud Console',
    credentialLabels: { key: 'OAuth Client ID', secret: 'OAuth Client Secret' },
    steps: getYouTubeSteps(supabaseUrl),
  },
});

// ————————————————————————————————————————————————————————————
// MAIN WIZARD COMPONENT
// ————————————————————————————————————————————————————————————
const PlatformSetupWizard: React.FC<PlatformSetupWizardProps> = ({
  platform: initialPlatform,
  // The OAuth Edge Function lives on the Hub project, so the redirect URI in the
  // guide must point there — never at a spoke's Supabase URL.
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://horvjqqifgrzxesuxtfm.supabase.co',
  branches = [],
  branchSocialAccounts = {},
  initialBranchId,
  onComplete,
  onClose,
  addToast,
}) => {
  const activeBranches = branches.filter(b => b.is_active);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    initialBranchId || (activeBranches.length === 1 ? activeBranches[0].id : null)
  );
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(initialPlatform || null);
  const [selectedSocialAccountId, setSelectedSocialAccountId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Real save + connect state (replaces the old fake "test" simulation)
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [credsSaved, setCredsSaved] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Landing = the connections dashboard; wizard = the guided add/edit flow.
  const [mode, setMode] = useState<'manage' | 'wizard'>('manage');
  const [allConnections, setAllConnections] = useState<Record<string, SocialConnectionStatus[]>>({});
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [disconnectingKey, setDisconnectingKey] = useState<string | null>(null);
  const [testState, setTestState] = useState<Record<string, { loading?: boolean; ok?: boolean; username?: string; error?: string }>>({});

  const selectedBranch = activeBranches.find(b => b.id === selectedBranchId) || null;
  const selectedBranchYouTubeAccounts = selectedBranchId
    ? (branchSocialAccounts[selectedBranchId] || []).filter(account => account.platform === 'youtube')
    : [];
  const selectedSocialAccount = selectedBranchYouTubeAccounts.find(account => account.id === selectedSocialAccountId) || null;

  const configs = getPlatformConfigs(supabaseUrl);
  const config = selectedPlatform ? configs[selectedPlatform] : null;
  const totalSteps = config ? config.steps.length + 1 : 0; // +1 for credential entry
  const isLastStep = currentStep === totalSteps - 1;

  // Persist the App ID / App Secret for this branch+platform (status='pending').
  const handleSaveCredentials = async () => {
    if (!selectedBranchId || !selectedPlatform) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await saveAppCredentials(
      selectedBranchId,
      selectedPlatform as SocialPlatform,
      appId,
      appSecret,
      selectedPlatform === 'youtube' ? selectedSocialAccountId || undefined : undefined,
    );
    setIsSaving(false);
    if (result.success) {
      setCredsSaved(true);
    } else {
      setSaveError(result.error || 'Failed to save credentials');
    }
  };

  // Launch the OAuth popup, then verify the branch now has an active connection.
  const handleConnectAccount = () => {
    if (!selectedBranchId || !selectedPlatform) return;
    if (selectedPlatform === 'youtube' && !selectedSocialAccountId) {
      setConnectError('Choose the exact YouTube channel before connecting.');
      return;
    }
    setIsConnecting(true);
    setConnectError(null);
    openSocialOAuthPopup(
      selectedBranchId,
      selectedPlatform as SocialPlatform,
      supabaseUrl,
      async () => {
        const result = await checkConnections(selectedBranchId);
        setIsConnecting(false);
        const connected = result.connections.some(
          c => c.platform === selectedPlatform
            && c.is_connected
            && (selectedPlatform !== 'youtube' || c.branch_social_account_id === selectedSocialAccountId)
        );
        if (connected) {
          // An active row proves only that an OAuth token was stored. Verify the
          // live publish target too, so Facebook cannot appear connected when
          // Meta returned a user token but no Page/page_id.
          const live = await testConnection(
            selectedBranchId,
            selectedPlatform as SocialPlatform,
            selectedPlatform === 'youtube' ? selectedSocialAccountId || undefined : undefined,
          );
          if (live.ok) {
            setIsConnected(true);
          } else {
            setIsConnected(false);
            setConnectError(live.error || 'The saved connection is not usable. Reconnect and grant the requested account access.');
          }
        } else {
          setConnectError('The account was not connected. Please complete the authorization popup and try again.');
        }
      },
      selectedPlatform === 'youtube' ? selectedSocialAccountId || undefined : undefined,
    );
  };

  // Reset per-connection state when the target branch or platform changes.
  const resetConnectionState = () => {
    setCredsSaved(false);
    setSaveError(null);
    setIsConnected(false);
    setConnectError(null);
    setAppId('');
    setAppSecret('');
    setSelectedSocialAccountId(null);
    setCurrentStep(0);
  };

  // ——— Management view (landing) ————————————————————————————
  // Load every active branch's live connection statuses for the dashboard.
  const loadAllConnections = useCallback(async () => {
    if (activeBranches.length === 0) return;
    setLoadingConnections(true);
    const entries = await Promise.all(
      activeBranches.map(async (b) => {
        const result = await checkConnections(b.id);
        return [b.id, result.connections] as [string, SocialConnectionStatus[]];
      })
    );
    setAllConnections(Object.fromEntries(entries));
    setLoadingConnections(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  useEffect(() => {
    if (mode === 'manage') loadAllConnections();
  }, [mode, loadAllConnections]);

  const backToManage = () => {
    setSelectedPlatform(null);
    setSelectedBranchId(activeBranches.length === 1 ? activeBranches[0].id : null);
    resetConnectionState();
    setMode('manage');
    loadAllConnections();
  };

  const handleFinish = () => {
    if (selectedPlatform && selectedBranchId && onComplete) {
      onComplete(selectedPlatform, selectedBranchId);
    }
    backToManage();
  };

  // Launch the wizard fresh (pick brand → platform → guide → connect).
  const startNewConnection = () => {
    resetConnectionState();
    setSelectedPlatform(null);
    setSelectedBranchId(activeBranches.length === 1 ? activeBranches[0].id : null);
    setMode('wizard');
  };

  // Jump straight into the credential step to re-enter app creds for a connection.
  const editConnection = (branchId: string, platform: Platform) => {
    resetConnectionState();
    setSelectedBranchId(branchId);
    setSelectedPlatform(platform);
    // Land on the credential-entry step (after all guide steps for that platform).
    setCurrentStep(configs[platform].steps.length);
    setMode('wizard');
  };

  // Start the full guided wizard for a not-yet-configured branch+platform.
  const setupConnection = (branchId: string, platform: Platform) => {
    resetConnectionState();
    setSelectedBranchId(branchId);
    setSelectedPlatform(platform);
    setMode('wizard');
  };

  // Re-run OAuth for an existing connection, then refresh the dashboard.
  // If the App Secret was never stored, OAuth would dead-end at the callback
  // ("Incomplete Credentials" — token exchange needs the secret), so route into
  // the credential step to collect it first instead of launching a doomed popup.
  const reconnect = (branchId: string, platform: SocialPlatform) => {
    const conn = allConnections[branchId]?.find(c => c.platform === platform);
    if (conn && conn.has_app_secret === false) {
      addToast?.('Enter this brand’s App Secret before connecting.', 'info');
      editConnection(branchId, platform as Platform);
      return;
    }
    openSocialOAuthPopup(branchId, platform, supabaseUrl, loadAllConnections);
  };

  const handleManageDisconnect = async (branchId: string, platform: SocialPlatform, brandName: string) => {
    if (!confirm(`Disconnect ${platform} for ${brandName}? This revokes Trellis's API access for that account.`)) return;
    setDisconnectingKey(`${branchId}_${platform}`);
    await disconnectPlatform(branchId, platform);
    setDisconnectingKey(null);
    loadAllConnections();
  };

  // Run a live API probe for a connection and stash the per-row result.
  const runTest = async (branchId: string, platform: SocialPlatform) => {
    const key = `${branchId}_${platform}`;
    setTestState(prev => ({ ...prev, [key]: { loading: true } }));
    const result = await testConnection(branchId, platform);
    setTestState(prev => ({ ...prev, [key]: { loading: false, ok: result.ok, username: result.username, error: result.error } }));
  };

  // ——— Management View (landing dashboard) ————————————————————————
  if (mode === 'manage') {
    const PLATFORM_ORDER: Platform[] = ['instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'youtube'];
    const statusMeta = {
      active: { label: 'Connected', cls: 'bg-emerald-100 text-emerald-700' },
      pending: { label: 'Saved · not connected', cls: 'bg-amber-100 text-amber-700' },
      none: { label: 'Not connected', cls: 'bg-slate-100 text-slate-400' },
    } as const;
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full mb-3">
              <Zap size={14} className="text-emerald-600" />
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Platform Setup</span>
            </div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Your Social Connections</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">Each brand connects its own accounts. Set up, reconnect, or remove them here.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAllConnections}
              disabled={loadingConnections}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-black text-[11px] uppercase tracking-wider hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingConnections ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={startNewConnection}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider hover:bg-emerald-600 transition shadow-lg"
            >
              <Plus size={14} /> New Connection
            </button>
          </div>
        </div>

        {activeBranches.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start space-x-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-amber-800 leading-relaxed">
              No active brands found. Create a brand under <strong>Branches</strong> first, then connect a platform here.
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {activeBranches.map((b) => {
              const conns = allConnections[b.id] || [];
              return (
                <div key={b.id} className="bg-white rounded-[2rem] border-2 border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center" style={{ backgroundColor: `${b.primary_color}1a` }}>
                      <span className="w-4 h-4 rounded-full" style={{ backgroundColor: b.primary_color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-slate-800 leading-tight truncate">{b.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{b.slug}</p>
                    </div>
                    {loadingConnections && <Loader2 size={16} className="animate-spin text-slate-300" />}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PLATFORM_ORDER.map((p) => {
                      const cfg = configs[p];
                      const Icon = cfg.icon;
                      if (p === 'youtube') {
                        const accounts = (branchSocialAccounts[b.id] || []).filter(account => account.platform === 'youtube');
                        const connectedCount = conns.filter(connection =>
                          connection.platform === 'youtube'
                          && connection.is_connected
                          && accounts.some(account => account.id === connection.branch_social_account_id)
                        ).length;
                        return (
                          <div key={p} className="flex items-center gap-3 p-3 rounded-2xl border border-red-100 bg-red-50/40">
                            <div className={`p-2 rounded-lg bg-white border border-red-100 ${cfg.color}`}><Icon size={16} /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 leading-tight">{cfg.name}</p>
                              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${connectedCount ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {connectedCount}/{accounts.length} channels connected
                              </span>
                            </div>
                            <button
                              onClick={() => setupConnection(b.id, 'youtube')}
                              disabled={accounts.length === 0}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider hover:bg-red-600 transition disabled:opacity-30"
                              title={accounts.length ? 'Configure a registered YouTube channel' : 'Register a YouTube account under Branches first'}
                            >
                              <Settings2 size={11} /> Configure
                            </button>
                          </div>
                        );
                      }
                      const conn = conns.find((c) => c.platform === p);
                      const status: 'active' | 'pending' | 'none' = conn ? (conn.is_connected ? 'active' : 'pending') : 'none';
                      const sm = statusMeta[status];
                      const disc = disconnectingKey === `${b.id}_${p}`;
                      const test = testState[`${b.id}_${p}`];
                      return (
                        <div key={p} className="flex flex-col gap-2 p-3 rounded-2xl border border-slate-100 bg-slate-50/60">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-white border border-slate-200 ${cfg.color}`}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 leading-tight">{cfg.name}</p>
                              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${sm.cls}`}>{sm.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {status === 'none' ? (
                                <button
                                  onClick={() => setupConnection(b.id, p)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider hover:bg-emerald-600 transition"
                                  title="Set up this platform"
                                >
                                  <Plus size={11} /> Set up
                                </button>
                              ) : (
                                <>
                                  {status === 'active' && (
                                    <button
                                      onClick={() => runTest(b.id, p as SocialPlatform)}
                                      disabled={test?.loading}
                                      className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-50"
                                      title="Test this connection"
                                    >
                                      {test?.loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => reconnect(b.id, p as SocialPlatform)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                                    title={status === 'pending' ? 'Finish connecting (authorize account)' : 'Reconnect'}
                                  >
                                    {status === 'pending' ? <PlugZap size={15} /> : <RotateCcw size={15} />}
                                  </button>
                                  <button
                                    onClick={() => editConnection(b.id, p)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
                                    title="Edit app credentials"
                                  >
                                    <Settings2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleManageDisconnect(b.id, p as SocialPlatform, b.name)}
                                    disabled={disc}
                                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                                    title="Disconnect / remove"
                                  >
                                    {disc ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {test && !test.loading && (
                            test.ok ? (
                              <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-wider pl-1">
                                <CheckCircle2 size={12} /> Live{test.username ? ` · ${test.username}` : ''}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 pl-1">
                                <AlertTriangle size={12} /> {test.error || 'Test failed'}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ——— Branch Selector (step 0 — always choose the brand first) ———————
  if (!selectedBranchId) {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-3 bg-emerald-50 border border-emerald-200 px-5 py-2 rounded-full">
            <GitBranch size={16} className="text-emerald-600" />
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Platform Setup Wizard</span>
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Which brand are you connecting?</h2>
          <p className="text-sm text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
            Social credentials are stored <strong>per brand</strong>. Pick the brand this connection belongs to —
            everything you set up next is saved only for this brand.
          </p>
        </div>

        {activeBranches.length === 0 ? (
          <div className="max-w-lg mx-auto bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start space-x-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-amber-800 leading-relaxed">
              No active brands found. Create a brand under <strong>Branches</strong> first, then come back to connect a platform.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {activeBranches.map((b) => (
              <button
                key={b.id}
                onClick={() => { setSelectedBranchId(b.id); resetConnectionState(); }}
                className="relative p-6 rounded-[2rem] border-2 border-slate-200 bg-white text-left transition-all group hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] hover:border-emerald-300"
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center" style={{ backgroundColor: `${b.primary_color}1a` }}>
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: b.primary_color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 leading-tight">{b.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{b.slug}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-600 transition">
                  <span>Set Up Connections</span>
                  <ArrowRight size={12} />
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="text-center">
          <button onClick={backToManage} className="text-[11px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest transition">← Back to connections</button>
        </div>
      </div>
    );
  }

  // Prominent "which brand" chip reused on the platform selector + wizard header.
  const branchChip = selectedBranch && (
    <div className="inline-flex items-center gap-2 bg-slate-900 text-white pl-2 pr-3 py-1.5 rounded-full">
      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedBranch.primary_color }} />
      <span className="text-[10px] font-black uppercase tracking-widest">{selectedBranch.name}</span>
    </div>
  );

  // ——— Platform Selector ——————————————————————————————————
  if (!selectedPlatform) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {branchChip}
          {activeBranches.length > 1 && (
            <button
              onClick={() => { setSelectedBranchId(null); resetConnectionState(); }}
              className="text-[10px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest transition"
            >
              Change brand
            </button>
          )}
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Connect a Social Platform</h2>
          <p className="text-sm text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
            Choose a platform to begin the guided setup for <strong>{selectedBranch?.name}</strong>. Each wizard walks
            you through every step — from creating your developer app to authorizing the live connection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {(Object.values(configs) as PlatformConfig[]).map((cfg) => {
            const Icon = cfg.icon;
            const isFacebook = cfg.id === 'facebook';
            return (
              <button
                key={cfg.id}
                onClick={() => { setSelectedPlatform(cfg.id); resetConnectionState(); }}
                className={`relative p-8 rounded-[2rem] border-2 text-left transition-all group ${cfg.bgColor} ${cfg.borderColor} hover:shadow-xl hover:scale-[1.02] active:scale-[0.99]`}
              >
                {isFacebook && (
                  <span className="absolute top-4 right-4 text-[8px] font-black uppercase bg-white/70 text-slate-500 px-2 py-1 rounded-full">
                    Uses your Meta app
                  </span>
                )}
                <div className={`w-14 h-14 rounded-2xl ${cfg.bgColor} border ${cfg.borderColor} flex items-center justify-center mb-5 shadow-sm`}>
                  <Icon size={28} className={cfg.color} />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-1">{cfg.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cfg.devConsoleName}</p>
                <div className="mt-4 flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-600 transition">
                  <span>Start Setup</span>
                  <ArrowRight size={12} />
                </div>
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-4 min-w-0">
          <button
            onClick={() => { setSelectedPlatform(null); resetConnectionState(); }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition flex-shrink-0"
            title="Back to platform selection"
          >
            <ChevronLeft size={20} />
          </button>
          <div className={`w-10 h-10 rounded-xl ${config!.bgColor} border ${config!.borderColor} flex items-center justify-center flex-shrink-0`}>
            <Icon size={20} className={config!.color} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-800 truncate">{config!.name} Setup</h3>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Step {currentStep + 1} of {totalSteps}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Always-visible reminder of which brand this connection is for */}
          {branchChip}
          <button onClick={backToManage} title="Back to connections" className="p-2 rounded-xl text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>
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
                {selectedPlatform === 'youtube' && (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      Exact YouTube Channel
                    </label>
                    {selectedBranchYouTubeAccounts.length > 0 ? (
                      <select
                        value={selectedSocialAccountId || ''}
                        onChange={event => {
                          setSelectedSocialAccountId(event.target.value || null);
                          setCredsSaved(false);
                          setIsConnected(false);
                          setConnectError(null);
                        }}
                        className="w-full bg-red-50 border-2 border-red-200 rounded-xl px-5 py-4 text-sm font-bold text-slate-800 outline-none focus:border-red-500 focus:bg-white transition"
                      >
                        <option value="">Choose the channel Google must return…</option>
                        {selectedBranchYouTubeAccounts.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.display_name || account.handle} · {account.external_account_id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Callout type="warning">No YouTube channels are registered for this branch. Add the channel under Branches before configuring OAuth.</Callout>
                    )}
                    {selectedSocialAccount && (
                      <p className="mt-2 text-[10px] font-bold text-red-600">
                        Google must return {selectedSocialAccount.display_name || selectedSocialAccount.handle} ({selectedSocialAccount.external_account_id}). A different Brand Account will be rejected.
                      </p>
                    )}
                  </div>
                )}
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

                {/* Step 1 — Save the developer-app credentials for this brand */}
                <div className="pt-4">
                  <button
                    onClick={handleSaveCredentials}
                    disabled={!appId || !appSecret || isSaving || isConnected || (selectedPlatform === 'youtube' && !selectedSocialAccountId)}
                    className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center space-x-3 transition shadow-lg ${
                      credsSaved
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-900 text-white hover:bg-emerald-600 disabled:opacity-30'
                    }`}
                  >
                    {isSaving ? (
                      <><Loader2 size={18} className="animate-spin" /><span>Saving Credentials...</span></>
                    ) : credsSaved ? (
                      <><CheckCircle2 size={18} /><span>Credentials Saved</span></>
                    ) : (
                      <><Lock size={18} /><span>Save Credentials for {selectedBranch?.name}</span></>
                    )}
                  </button>
                </div>

                {saveError && (
                  <Callout type="warning">
                    Couldn't save credentials: {saveError}. Double-check the
                    <strong> {config!.credentialLabels.key}</strong> and <strong>{config!.credentialLabels.secret}</strong> from the {config!.devConsoleName}.
                  </Callout>
                )}

                {/* Step 2 — Authorize the live account via OAuth */}
                {credsSaved && !isConnected && (
                  <>
                    <Callout type="tip">
                      Saved &amp; encrypted for <strong>{selectedBranch?.name}</strong>. Now authorize the account so Trellis can
                      publish on its behalf. A popup will open for {config!.name} — approve the permissions, then it'll close automatically.
                    </Callout>
                    <button
                      onClick={handleConnectAccount}
                      disabled={isConnecting}
                      className="w-full py-5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center space-x-3 transition shadow-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {isConnecting ? (
                        <><Loader2 size={18} className="animate-spin" /><span>Waiting for authorization...</span></>
                      ) : (
                        <><PlugZap size={18} /><span>Connect {config!.name} Account</span></>
                      )}
                    </button>
                  </>
                )}

                {connectError && (
                  <Callout type="warning">{connectError}</Callout>
                )}

                {isConnected && (
                  <Callout type="tip">
                    <strong>{config!.name}</strong> is connected for <strong>{selectedBranch?.name}</strong>. Click
                    <strong> "Done"</strong> below to return to your connections.
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

          {isLastStep && isConnected ? (
            <button
              onClick={handleFinish}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-lg"
            >
              <Check size={14} />
              <span>Done</span>
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
