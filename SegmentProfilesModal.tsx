import React, { useState, useMemo, useCallback } from 'react';
import {
  X, Search, ChevronLeft, ChevronRight, ArrowUpDown,
  ArrowUp, ArrowDown, Mail, Download, Users
} from 'lucide-react';
import { EnrichedProfile } from './types';
import { Segment } from './segmentTypes';

interface SegmentProfilesModalProps {
  segment: Segment;
  profiles: EnrichedProfile[];
  isOpen: boolean;
  onClose: () => void;
}

type SortField = 'name' | 'email' | 'ltv' | 'orders' | 'last_purchase';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 25;

export const SegmentProfilesModal: React.FC<SegmentProfilesModalProps> = ({
  segment,
  profiles,
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('ltv');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter profiles by search
  const filteredProfiles = useMemo(() => {
    if (!searchTerm.trim()) return profiles;

    const term = searchTerm.toLowerCase();
    return profiles.filter(p =>
      p.email?.toLowerCase().includes(term) ||
      p.first_name?.toLowerCase().includes(term) ||
      p.last_name?.toLowerCase().includes(term) ||
      p.shipping_address?.city?.toLowerCase().includes(term) ||
      p.shipping_address?.state?.toLowerCase().includes(term)
    );
  }, [profiles, searchTerm]);

  // Sort profiles
  const sortedProfiles = useMemo(() => {
    const sorted = [...filteredProfiles].sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'name':
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
          break;
        case 'email':
          aVal = a.email?.toLowerCase() || '';
          bVal = b.email?.toLowerCase() || '';
          break;
        case 'ltv':
          aVal = a.order_stats?.ltv || 0;
          bVal = b.order_stats?.ltv || 0;
          break;
        case 'orders':
          aVal = a.order_stats?.order_count || 0;
          bVal = b.order_stats?.order_count || 0;
          break;
        case 'last_purchase':
          aVal = a.order_stats?.last_purchase_at ? new Date(a.order_stats.last_purchase_at).getTime() : 0;
          bVal = b.order_stats?.last_purchase_at ? new Date(b.order_stats.last_purchase_at).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredProfiles, sortField, sortDirection]);

  // Paginate
  const totalPages = Math.ceil(sortedProfiles.length / PAGE_SIZE);
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedProfiles.slice(start, start + PAGE_SIZE);
  }, [sortedProfiles, currentPage]);

  // Reset page when search changes
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-emerald-600" />
      : <ArrowDown className="w-3 h-3 text-emerald-600" />;
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ['Email', 'First Name', 'Last Name', 'LTV', 'Orders', 'Last Purchase', 'City', 'State'];
    const rows = sortedProfiles.map(p => [
      p.email || '',
      p.first_name || '',
      p.last_name || '',
      p.order_stats?.ltv?.toFixed(2) || '0',
      p.order_stats?.order_count || '0',
      p.order_stats?.last_purchase_at ? new Date(p.order_stats.last_purchase_at).toLocaleDateString() : '',
      p.shipping_address?.city || '',
      p.shipping_address?.state || '',
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${segment.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-10 lg:inset-16 bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-emerald-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{segment.name}</h2>
              <p className="text-sm text-gray-500">
                {filteredProfiles.length} of {profiles.length} profiles
                {searchTerm && ' (filtered)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Stats Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, email, city, state..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>
              Total LTV: <span className="font-semibold text-emerald-600">
                ${filteredProfiles.reduce((sum, p) => sum + (p.order_stats?.ltv || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              Avg LTV: <span className="font-semibold text-gray-700">
                ${filteredProfiles.length > 0
                  ? (filteredProfiles.reduce((sum, p) => sum + (p.order_stats?.ltv || 0), 0) / filteredProfiles.length).toFixed(2)
                  : '0.00'}
              </span>
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Name <SortIcon field="name" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('email')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Email <SortIcon field="email" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Location
                  </span>
                </th>
                <th className="px-6 py-3 text-right">
                  <button
                    onClick={() => handleSort('ltv')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto"
                  >
                    LTV <SortIcon field="ltv" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right">
                  <button
                    onClick={() => handleSort('orders')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto"
                  >
                    Orders <SortIcon field="orders" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right">
                  <button
                    onClick={() => handleSort('last_purchase')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto"
                  >
                    Last Purchase <SortIcon field="last_purchase" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedProfiles.map((profile, idx) => (
                <tr key={profile.id || profile.email || idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">
                      {profile.first_name || profile.last_name
                        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                        : '—'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600">{profile.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600">
                      {profile.shipping_address?.city || profile.shipping_address?.state
                        ? `${profile.shipping_address.city || ''}${profile.shipping_address.city && profile.shipping_address.state ? ', ' : ''}${profile.shipping_address.state || ''}`
                        : '—'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-semibold text-emerald-600">
                      ${(profile.order_stats?.ltv || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-gray-700">
                      {profile.order_stats?.order_count || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-gray-500">
                      {profile.order_stats?.last_purchase_at
                        ? new Date(profile.order_stats.last_purchase_at).toLocaleDateString()
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {paginatedProfiles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? 'No profiles match your search' : 'No profiles in this segment'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, sortedProfiles.length)} of {sortedProfiles.length}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 text-sm rounded-lg ${
                      currentPage === pageNum
                        ? 'bg-emerald-600 text-white'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SegmentProfilesModal;
