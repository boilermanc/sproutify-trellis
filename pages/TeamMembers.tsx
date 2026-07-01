import React, { useState, useEffect, useCallback } from 'react';
import { Profile, Role } from '../types';
import { getTeamMembers, inviteUser } from '../lib/supabaseService';
import { Loader2, Users, Shield, Code2, Megaphone, Eye, Circle, Clock, UserPlus, X, Mail, Send } from 'lucide-react';

const ROLE_CONFIG: Record<Role, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  admin: { label: 'Admin', icon: Shield, color: 'text-rose-700', bg: 'bg-rose-100' },
  marketer: { label: 'Marketer', icon: Megaphone, color: 'text-amber-700', bg: 'bg-amber-100' },
  developer: { label: 'Developer', icon: Code2, color: 'text-indigo-700', bg: 'bg-indigo-100' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-slate-700', bg: 'bg-slate-100' },
};

const ROLE_OPTIONS: Role[] = ['admin', 'marketer', 'developer', 'viewer'];

interface TeamMembersProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const TeamMembers: React.FC<TeamMembersProps> = ({ addToast }) => {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('marketer');
  const [submitting, setSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const fetchTeamMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTeamMembers();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  const openInvite = () => {
    setInviteEmail('');
    setInviteFirstName('');
    setInviteRole('marketer');
    setInviteError(null);
    setInviteSuccess(null);
    setInviteOpen(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    setSubmitting(true);

    const result = await inviteUser({
      email: inviteEmail.trim().toLowerCase(),
      first_name: inviteFirstName.trim(),
      role: inviteRole,
    });

    setSubmitting(false);

    const target = inviteEmail.trim().toLowerCase();

    if (!result.success) {
      // The edge function only reports success once the invite email
      // actually sent, so a failure here means the email did NOT go out.
      const msg = result.error || 'Failed to send invite';
      setInviteError(msg);
      addToast(`Invite failed: ${msg}`, 'error');
      return;
    }

    // Success == the invite email was accepted by the mail server.
    addToast(`Invite email sent to ${target}`, 'success');
    setInviteEmail('');
    setInviteFirstName('');
    setInviteOpen(false);
    await fetchTeamMembers();
  };

  return (
    <div className="space-y-6">
      {/* Header — always visible so Invite is reachable even with no members */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Team Members</h2>
              <p className="text-sm text-slate-500">
                {members.length} member{members.length !== 1 ? 's' : ''} with access
              </p>
            </div>
          </div>
          <button
            onClick={openInvite}
            className="inline-flex items-center space-x-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition"
          >
            <UserPlus size={16} />
            <span>Invite User</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="ml-3 text-slate-600 font-medium">Loading team members...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-700 font-bold mb-2">Failed to load team members</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">No Team Members Yet</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Invite your first team member, or assign a role to a profile in the database to see them here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Member</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Role</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((member) => {
                const roleConfig = member.role ? ROLE_CONFIG[member.role] : null;
                const RoleIcon = roleConfig?.icon || Users;
                const pending = member.metadata?.invite_status === 'pending';

                return (
                  <tr key={member.id} className="hover:bg-slate-50/80 transition-all">
                    <td className="px-10 py-6">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${roleConfig?.bg || 'bg-slate-100'} ${roleConfig?.color || 'text-slate-500'}`}>
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt={member.first_name} className="w-full h-full object-cover rounded-2xl" />
                            ) : (
                              member.first_name.charAt(0)
                            )}
                          </div>
                          {/* Active indicator dot */}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            member.status === 'active' && !pending ? 'bg-emerald-500' : 'bg-slate-300'
                          }`} />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-sm">{member.first_name} {member.last_name || ''}</p>
                          {member.last_active && (
                            <p className="text-[10px] text-slate-400 flex items-center mt-0.5">
                              <Clock size={10} className="mr-1" />
                              Last seen {new Date(member.last_active).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <p className="text-sm text-slate-600 font-mono">{member.email}</p>
                    </td>
                    <td className="px-10 py-6 text-center">
                      {roleConfig && (
                        <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl ${roleConfig.bg}`}>
                          <RoleIcon size={14} className={roleConfig.color} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${roleConfig.color}`}>
                            {roleConfig.label}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-10 py-6 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        {pending ? (
                          <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-sky-100 text-sky-700">
                            <Mail size={10} />
                            <span>Invited</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                            member.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : member.status === 'archived'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Circle size={6} className={`fill-current ${
                              member.status === 'active' ? 'text-emerald-500' : 'text-slate-400'
                            }`} />
                            <span>{member.status}</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-black text-slate-800">Invite a Team Member</h3>
              </div>
              <button
                onClick={() => setInviteOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {inviteError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
                <p className="text-red-700 text-sm font-medium">{inviteError}</p>
              </div>
            )}
            {inviteSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
                <p className="text-emerald-700 text-sm font-medium">{inviteSuccess}</p>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">First Name</label>
                <input
                  type="text"
                  value={inviteFirstName}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium text-sm"
                  placeholder="Jane"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium text-sm"
                  placeholder="jane@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((r) => {
                    const cfg = ROLE_CONFIG[r];
                    const RIcon = cfg.icon;
                    const selected = inviteRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInviteRole(r)}
                        className={`flex items-center space-x-2 px-4 py-3 rounded-xl border transition ${
                          selected
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <RIcon size={14} className={cfg.color} />
                        <span className="text-xs font-black uppercase tracking-wide text-slate-700">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black text-xs uppercase tracking-widest transition flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={14} className="mr-2" />
                      Send Invite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamMembers;
