import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, UserPlus, ShieldAlert, Trash2, RefreshCw, X, Plus,
} from 'lucide-react';
import { TrellisUser } from '../types';
import {
  listTrellisUsers,
  inviteTrellisUser,
  updateTrellisUserRole,
  setTrellisUserStatus,
  assignBranch,
  unassignBranch,
  listBranches,
  getCurrentTrellisUser,
  BranchOption,
  TrellisRole,
  BranchRole,
} from '../trellisUsersService';

const ROLES: TrellisRole[] = ['owner', 'admin', 'operator', 'analyst', 'viewer'];
const BRANCH_ROLES: BranchRole[] = ['lead', 'member', 'viewer'];
const MANAGER_ROLES: TrellisRole[] = ['owner', 'admin'];

const STATUS_STYLES: Record<TrellisUser['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  invited: 'bg-amber-100 text-amber-700',
  suspended: 'bg-orange-100 text-orange-700',
  deleted: 'bg-slate-100 text-slate-400',
};

function initials(user: TrellisUser): string {
  const source = (user.full_name || user.email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const TeamPanel: React.FC = () => {
  const [users, setUsers] = useState<TrellisUser[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Current user's role drives whether mutating controls are shown.
  const [currentRole, setCurrentRole] = useState<TrellisRole>('admin');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<TrellisRole>('operator');
  const [inviting, setInviting] = useState(false);

  // Per-row branch assignment drafts: { [userId]: { branch_id, branch_role } }
  const [assignDraft, setAssignDraft] = useState<
    Record<string, { branch_id: string; branch_role: BranchRole }>
  >({});

  const canManage = useMemo(() => MANAGER_ROLES.includes(currentRole), [currentRole]);

  const load = async () => {
    setLoading(true);
    const [usersRes, branchesRes, meRes] = await Promise.all([
      listTrellisUsers(),
      listBranches(),
      getCurrentTrellisUser(),
    ]);

    if (usersRes.error) setError(usersRes.error);
    else setUsers(usersRes.data || []);

    if (branchesRes.data) setBranches(branchesRes.data);

    // TODO: wire to real auth session — falls back to 'admin' if the
    // logged-in auth user has no trellis_users row yet.
    if (meRes.data?.role) setCurrentRole(meRes.data.role);
    else setCurrentRole('admin');

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    const res = await inviteTrellisUser({
      email: inviteEmail,
      full_name: inviteName,
      role: inviteRole,
    });
    setInviting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setInviteEmail('');
    setInviteName('');
    setInviteRole('operator');
    load();
  };

  const handleRoleChange = async (id: string, role: TrellisRole) => {
    setBusyId(id);
    setError(null);
    const res = await updateTrellisUserRole(id, role);
    setBusyId(null);
    if (res.error) setError(res.error);
    else setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));
  };

  const handleStatus = async (id: string, status: TrellisUser['status']) => {
    setBusyId(id);
    setError(null);
    const res = await setTrellisUserStatus(id, status);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (status === 'deleted') setUsers(prev => prev.filter(u => u.id !== id));
    else setUsers(prev => prev.map(u => (u.id === id ? { ...u, status } : u)));
  };

  const handleAssign = async (userId: string) => {
    const draft = assignDraft[userId];
    if (!draft?.branch_id) return;
    setBusyId(userId);
    setError(null);
    const res = await assignBranch(userId, draft.branch_id, draft.branch_role || 'member');
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAssignDraft(prev => ({ ...prev, [userId]: { branch_id: '', branch_role: 'member' } }));
    load();
  };

  const handleUnassign = async (userId: string, branchId: string) => {
    setBusyId(userId);
    setError(null);
    const res = await unassignBranch(userId, branchId);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setUsers(prev =>
      prev.map(u =>
        u.id === userId
          ? { ...u, branches: u.branches.filter(b => b.branch_id !== branchId) }
          : u
      )
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Team</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
            Manage Trellis operators, roles, and branch access
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center space-x-2 bg-red-50 border border-red-100 text-red-600 text-xs font-bold px-4 py-3 rounded-2xl">
          <ShieldAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Invite member */}
      {canManage && (
        <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6">
          <div className="flex items-center space-x-2 mb-4">
            <UserPlus size={16} className="text-emerald-600" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Invite Member</h4>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="operator@sproutify.app"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Full Name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Jane Operator"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as TrellisRole)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 capitalize"
              >
                {ROLES.map(r => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {inviting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              <span>Invite</span>
            </button>
          </div>
        </div>
      )}

      {/* Roster */}
      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw size={20} className="animate-spin mr-2" />
          <span className="text-xs font-bold uppercase tracking-widest">Loading team…</span>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users size={32} className="mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest">No team members yet</span>
        </div>
      ) : (
        <div className="border-2 border-slate-100 rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 px-6 py-4">Member</th>
                <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-4">Role</th>
                <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-4">Status</th>
                <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-4">Branches</th>
                {canManage && (
                  <th className="text-right text-[9px] font-black uppercase tracking-widest text-slate-400 px-6 py-4">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => {
                const draft = assignDraft[user.id] || { branch_id: '', branch_role: 'member' as BranchRole };
                const assignedIds = new Set(user.branches.map(b => b.branch_id));
                const available = branches.filter(b => !assignedIds.has(b.id));
                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition align-top">
                    {/* Member */}
                    <td className="px-6 py-5">
                      <div className="flex items-center space-x-3">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-black">
                            {initials(user)}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-black text-slate-800">{user.full_name || '—'}</div>
                          <div className="text-xs text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-5">
                      {canManage ? (
                        <select
                          value={user.role}
                          disabled={busyId === user.id}
                          onChange={e => handleRoleChange(user.id, e.target.value as TrellisRole)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white capitalize focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r} className="capitalize">{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-600 capitalize">{user.role}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-5">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${STATUS_STYLES[user.status]}`}>
                        {user.status}
                      </span>
                    </td>

                    {/* Branches */}
                    <td className="px-4 py-5">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {user.branches.length === 0 && (
                          <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">None</span>
                        )}
                        {user.branches.map(b => (
                          <span
                            key={b.branch_id}
                            className="inline-flex items-center space-x-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg"
                          >
                            <span>{b.branch_name}</span>
                            <span className="text-slate-400">· {b.branch_role}</span>
                            {canManage && (
                              <button
                                onClick={() => handleUnassign(user.id, b.branch_id)}
                                className="text-slate-400 hover:text-red-500 transition"
                                title="Unassign branch"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>

                      {/* Assignment control */}
                      {canManage && available.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <select
                            value={draft.branch_id}
                            onChange={e =>
                              setAssignDraft(prev => ({
                                ...prev,
                                [user.id]: { ...draft, branch_id: e.target.value },
                              }))
                            }
                            className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          >
                            <option value="">+ Branch…</option>
                            {available.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                          <select
                            value={draft.branch_role}
                            onChange={e =>
                              setAssignDraft(prev => ({
                                ...prev,
                                [user.id]: { ...draft, branch_role: e.target.value as BranchRole },
                              }))
                            }
                            className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold bg-white capitalize focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          >
                            {BRANCH_ROLES.map(r => (
                              <option key={r} value={r} className="capitalize">{r}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAssign(user.id)}
                            disabled={!draft.branch_id || busyId === user.id}
                            className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-40"
                            title="Assign branch"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-end space-x-2">
                          {user.status !== 'suspended' && (
                            <button
                              onClick={() => handleStatus(user.id, 'suspended')}
                              disabled={busyId === user.id}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-orange-50 text-orange-600 hover:bg-orange-100 transition disabled:opacity-50"
                            >
                              <ShieldAlert size={12} />
                              <span>Suspend</span>
                            </button>
                          )}
                          {user.status === 'suspended' && (
                            <button
                              onClick={() => handleStatus(user.id, 'active')}
                              disabled={busyId === user.id}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition disabled:opacity-50"
                            >
                              Reactivate
                            </button>
                          )}
                          <button
                            onClick={() => handleStatus(user.id, 'deleted')}
                            disabled={busyId === user.id}
                            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
