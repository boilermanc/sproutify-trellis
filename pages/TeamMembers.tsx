import React, { useState, useEffect } from 'react';
import { Profile, Role } from '../types';
import { getTeamMembers } from '../lib/supabaseService';
import { Loader2, Users, Shield, Code2, Megaphone, Eye, Circle, Clock } from 'lucide-react';

const ROLE_CONFIG: Record<Role, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  admin: { label: 'Admin', icon: Shield, color: 'text-rose-700', bg: 'bg-rose-100' },
  marketer: { label: 'Marketer', icon: Megaphone, color: 'text-amber-700', bg: 'bg-amber-100' },
  developer: { label: 'Developer', icon: Code2, color: 'text-indigo-700', bg: 'bg-indigo-100' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-slate-700', bg: 'bg-slate-100' },
};

const TeamMembers: React.FC = () => {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTeamMembers() {
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
    }
    fetchTeamMembers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="ml-3 text-slate-600 font-medium">Loading team members...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-red-700 font-bold mb-2">Failed to load team members</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-slate-100 rounded-2xl flex items-center justify-center">
          <Users className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">No Team Members Yet</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Team members are profiles with an assigned role. Add a role to profiles in the database to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Team Members</h2>
              <p className="text-sm text-slate-500">{members.length} member{members.length !== 1 ? 's' : ''} with access</p>
            </div>
          </div>
        </div>
      </div>

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
                          member.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamMembers;
