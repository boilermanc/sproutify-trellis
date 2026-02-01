import React, { useState, useRef } from 'react';
import { Profile } from '../types';
import { updateProfile, uploadAvatar } from '../lib/supabaseService';
import {
  Loader2, Camera, User, Mail, Phone, Save,
  Shield, AlertCircle, CheckCircle2
} from 'lucide-react';

interface UserProfileProps {
  profile: Profile | null;
  onProfileUpdate: (profile: Profile) => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  marketer: 'Marketer',
  developer: 'Developer',
  viewer: 'Viewer',
};

const UserProfile: React.FC<UserProfileProps> = ({ profile, onProfileUpdate }) => {
  const [formData, setFormData] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="ml-3 text-slate-600 font-medium">Loading profile...</span>
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    const result = await updateProfile(profile.id, formData);

    if (result.success) {
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      onProfileUpdate({ ...profile, ...formData });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update profile' });
    }

    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 2MB' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const { url, error } = await uploadAvatar(profile.id, file);

    if (url) {
      // Update profile with new avatar URL
      const updateResult = await updateProfile(profile.id, { avatar_url: url });
      if (updateResult.success) {
        setMessage({ type: 'success', text: 'Avatar updated!' });
        onProfileUpdate({ ...profile, avatar_url: url });
      } else {
        setMessage({ type: 'error', text: 'Failed to save avatar URL' });
      }
    } else {
      setMessage({ type: 'error', text: error || 'Failed to upload avatar' });
    }

    setUploading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
          {/* Avatar */}
          <div className="relative group">
            <div
              onClick={handleAvatarClick}
              className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center cursor-pointer overflow-hidden border-4 border-white shadow-lg transition-transform hover:scale-105"
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              ) : profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.first_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-black text-emerald-600">
                  {profile.first_name?.charAt(0) || 'U'}
                </span>
              )}
            </div>
            <button
              onClick={handleAvatarClick}
              disabled={uploading}
              className="absolute -bottom-2 -right-2 p-2 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Camera size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Name & Role */}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-800">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-slate-500 font-mono text-sm">{profile.email}</p>
            {profile.role && (
              <div className="mt-3 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-50 rounded-xl">
                <Shield size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">
                  {ROLE_LABELS[profile.role] || profile.role}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center space-x-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="text-emerald-600" size={20} />
          ) : (
            <AlertCircle className="text-red-600" size={20} />
          )}
          <span
            className={`text-sm font-bold ${
              message.type === 'success' ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {message.text}
          </span>
        </div>
      )}

      {/* Profile Form */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
          Profile Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* First Name */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              First Name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                placeholder="Enter first name"
              />
            </div>
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Last Name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                placeholder="Enter last name"
              />
            </div>
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-sm text-slate-500 cursor-not-allowed"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 ml-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            Bio
          </label>
          <textarea
            name="bio"
            value={formData.bio}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm resize-none"
            placeholder="Tell us a bit about yourself..."
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save size={18} />
            )}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Account ID
        </p>
        <p className="text-xs font-mono text-slate-500">{profile.id}</p>
      </div>
    </div>
  );
};

export default UserProfile;
