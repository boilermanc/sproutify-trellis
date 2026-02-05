import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Plus, Search, Filter, Crown, Sparkles, Clock, Repeat, Mail,
  UserX, MapPin, Package, Trash2, Edit2, Play, X, ChevronDown, ChevronRight,
  Save, Layers
} from 'lucide-react';
import { EnrichedProfile } from './types';
import { SpokeConnection } from './types';
import { fetchEnrichedProfiles } from './spokeConnector';
import {
  Segment,
  SegmentRule,
  SegmentRuleGroup,
  SEGMENT_FIELDS,
  PRESET_SEGMENTS,
  getOperatorsForType,
  SegmentField,
} from './segmentTypes';
import {
  filterProfilesBySegment,
  countProfilesInSegment,
  evaluateSegment,
} from './segmentEngine';
import { SegmentProfilesModal } from './SegmentProfilesModal';

interface SegmentsProps {
  spokeConnections: SpokeConnection[];
}

// Icon map for segments
const iconMap: Record<string, React.ReactNode> = {
  'crown': <Crown className="w-5 h-5" />,
  'sparkles': <Sparkles className="w-5 h-5" />,
  'clock': <Clock className="w-5 h-5" />,
  'repeat': <Repeat className="w-5 h-5" />,
  'mail': <Mail className="w-5 h-5" />,
  'user-x': <UserX className="w-5 h-5" />,
  'map-pin': <MapPin className="w-5 h-5" />,
  'package': <Package className="w-5 h-5" />,
  'layers': <Layers className="w-5 h-5" />,
};

// Color map for segments
const colorMap: Record<string, string> = {
  'amber': 'bg-amber-100 text-amber-700 border-amber-200',
  'blue': 'bg-blue-100 text-blue-700 border-blue-200',
  'red': 'bg-red-100 text-red-700 border-red-200',
  'emerald': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'purple': 'bg-purple-100 text-purple-700 border-purple-200',
  'gray': 'bg-gray-100 text-gray-700 border-gray-200',
  'teal': 'bg-teal-100 text-teal-700 border-teal-200',
  'green': 'bg-green-100 text-green-700 border-green-200',
};

export const Segments: React.FC<SegmentsProps> = ({ spokeConnections }) => {
  // State
  const [profiles, setProfiles] = useState<EnrichedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customSegments, setCustomSegments] = useState<Segment[]>(() => {
    const saved = localStorage.getItem('trellis_custom_segments');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [profilesModalOpen, setProfilesModalOpen] = useState(false);

  // New segment form state
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentDescription, setNewSegmentDescription] = useState('');
  const [newSegmentColor, setNewSegmentColor] = useState('blue');
  const [newSegmentRules, setNewSegmentRules] = useState<SegmentRule[]>([]);

  // Convert presets to full segments
  const presetSegments: Segment[] = useMemo(() =>
    PRESET_SEGMENTS.map((preset, index) => ({
      ...preset,
      id: `preset-${index}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    []
  );

  // All segments combined
  const allSegments = useMemo(() =>
    [...presetSegments, ...customSegments],
    [presetSegments, customSegments]
  );

  // Fetch profiles on mount
  useEffect(() => {
    const fetchProfiles = async () => {
      if (spokeConnections.length === 0) return;
      setIsLoading(true);
      try {
        const { profiles: fetchedProfiles } = await fetchEnrichedProfiles(spokeConnections);
        setProfiles(fetchedProfiles);
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfiles();
  }, [spokeConnections]);

  // Save custom segments to localStorage
  useEffect(() => {
    localStorage.setItem('trellis_custom_segments', JSON.stringify(customSegments));
  }, [customSegments]);

  // Get matching profiles for selected segment
  const matchingProfiles = useMemo(() => {
    if (!selectedSegment) return [];
    return filterProfilesBySegment(profiles, selectedSegment);
  }, [selectedSegment, profiles]);

  // Add a new rule to the form
  const addRule = () => {
    setNewSegmentRules([
      ...newSegmentRules,
      {
        id: crypto.randomUUID(),
        field: 'ltv',
        operator: 'greater_or_equal',
        value: 0,
      }
    ]);
  };

  // Update a rule
  const updateRule = (ruleId: string, updates: Partial<SegmentRule>) => {
    setNewSegmentRules(rules =>
      rules.map(r => r.id === ruleId ? { ...r, ...updates } : r)
    );
  };

  // Remove a rule
  const removeRule = (ruleId: string) => {
    setNewSegmentRules(rules => rules.filter(r => r.id !== ruleId));
  };

  // Save new segment
  const saveSegment = () => {
    if (!newSegmentName.trim() || newSegmentRules.length === 0) return;

    const newSegment: Segment = {
      id: crypto.randomUUID(),
      name: newSegmentName.trim(),
      description: newSegmentDescription.trim(),
      color: newSegmentColor,
      icon: 'layers',
      is_preset: false,
      rule_groups: [{
        id: crypto.randomUUID(),
        join: 'AND',
        rules: newSegmentRules,
      }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setCustomSegments([...customSegments, newSegment]);
    resetForm();
  };

  // Delete custom segment
  const deleteSegment = (segmentId: string) => {
    setCustomSegments(segments => segments.filter(s => s.id !== segmentId));
    if (selectedSegment?.id === segmentId) {
      setSelectedSegment(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setIsCreating(false);
    setEditingSegment(null);
    setNewSegmentName('');
    setNewSegmentDescription('');
    setNewSegmentColor('blue');
    setNewSegmentRules([]);
  };

  // Get field by ID
  const getField = (fieldId: string): SegmentField | undefined => {
    return SEGMENT_FIELDS.find(f => f.id === fieldId);
  };

  // Preview count for current rules being built
  const previewCount = useMemo(() => {
    if (newSegmentRules.length === 0) return 0;
    const previewSegment: Segment = {
      id: 'preview',
      name: 'Preview',
      rule_groups: [{ id: 'preview-group', join: 'AND', rules: newSegmentRules }],
      created_at: '',
      updated_at: '',
    };
    return countProfilesInSegment(profiles, previewSegment);
  }, [newSegmentRules, profiles]);

  // Render rule editor row
  const renderRuleEditor = (rule: SegmentRule, index: number) => {
    const field = getField(rule.field);
    const operators = field ? getOperatorsForType(field.type) : [];

    return (
      <div key={rule.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
        {index > 0 && (
          <span className="text-xs font-medium text-gray-500 w-10">AND</span>
        )}
        {index === 0 && <span className="w-10" />}

        {/* Field selector */}
        <select
          value={rule.field}
          onChange={(e) => {
            const newField = getField(e.target.value);
            const newOperators = newField ? getOperatorsForType(newField.type) : [];
            updateRule(rule.id, {
              field: e.target.value,
              operator: newOperators[0]?.value || 'is',
              value: newField?.type === 'boolean' ? true : newField?.type === 'number' ? 0 : '',
            });
          }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <optgroup label="Profile">
            {SEGMENT_FIELDS.filter(f => f.category === 'profile').map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Orders">
            {SEGMENT_FIELDS.filter(f => f.category === 'orders').map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Products">
            {SEGMENT_FIELDS.filter(f => f.category === 'products').map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Location">
            {SEGMENT_FIELDS.filter(f => f.category === 'location').map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Demographics">
            {SEGMENT_FIELDS.filter(f => f.category === 'demographics').map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
        </select>

        {/* Operator selector */}
        <select
          value={rule.operator}
          onChange={(e) => updateRule(rule.id, { operator: e.target.value as any })}
          className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          {operators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>

        {/* Value input */}
        {!['is_blank', 'is_not_blank', 'is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(rule.operator) && (
          <input
            type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
            value={rule.value as string | number}
            onChange={(e) => updateRule(rule.id, {
              value: field?.type === 'number' ? Number(e.target.value) : e.target.value
            })}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Value..."
          />
        )}

        {/* Second value for 'between' operator */}
        {rule.operator === 'between' && (
          <>
            <span className="text-gray-500 text-sm">and</span>
            <input
              type="number"
              value={rule.value2 || ''}
              onChange={(e) => updateRule(rule.id, { value2: Number(e.target.value) })}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Max..."
            />
          </>
        )}

        {/* Remove button */}
        <button
          onClick={() => removeRule(rule.id)}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full">
      {/* Sidebar - Segment List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Segments</h2>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {profiles.length.toLocaleString()} total profiles loaded
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Preset Segments */}
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Preset Segments
            </h3>
            {presetSegments.map(segment => (
              <button
                key={segment.id}
                onClick={() => setSelectedSegment(segment)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  selectedSegment?.id === segment.id
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className={`p-2 rounded-lg border ${colorMap[segment.color || 'gray']}`}>
                  {iconMap[segment.icon || 'layers']}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{segment.name}</div>
                  <div className="text-sm text-gray-500">
                    {countProfilesInSegment(profiles, segment).toLocaleString()} profiles
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Custom Segments */}
          {customSegments.length > 0 && (
            <div>
              <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Custom Segments
              </h3>
              {customSegments.map(segment => (
                <div
                  key={segment.id}
                  className={`group flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    selectedSegment?.id === segment.id
                      ? 'bg-emerald-50 border border-emerald-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => setSelectedSegment(segment)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <div className={`p-2 rounded-lg border ${colorMap[segment.color || 'gray']}`}>
                      {iconMap[segment.icon || 'layers']}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{segment.name}</div>
                      <div className="text-sm text-gray-500">
                        {countProfilesInSegment(profiles, segment).toLocaleString()} profiles
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteSegment(segment.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {isCreating ? (
          /* Segment Builder */
          <div className="p-6 max-w-3xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Create New Segment</h2>
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Segment Details */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Segment Name
                  </label>
                  <input
                    type="text"
                    value={newSegmentName}
                    onChange={(e) => setNewSegmentName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="e.g., High-Value West Coast"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newSegmentDescription}
                    onChange={(e) => setNewSegmentDescription(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Brief description of this segment"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color
                  </label>
                  <div className="flex gap-2">
                    {Object.keys(colorMap).map(color => (
                      <button
                        key={color}
                        onClick={() => setNewSegmentColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          colorMap[color].split(' ')[0]
                        } ${
                          newSegmentColor === color
                            ? 'border-gray-900 scale-110'
                            : 'border-transparent hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Rules Builder */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Rules (all must match)
                  </label>
                  <div className="text-sm text-gray-500">
                    Preview: <span className="font-semibold text-emerald-600">{previewCount.toLocaleString()}</span> profiles
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  {newSegmentRules.map((rule, index) => renderRuleEditor(rule, index))}
                </div>

                <button
                  onClick={addRule}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Rule
                </button>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSegment}
                  disabled={!newSegmentName.trim() || newSegmentRules.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Save Segment
                </button>
              </div>
            </div>
          </div>
        ) : selectedSegment ? (
          /* Segment Details View */
          <div className="p-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl border ${colorMap[selectedSegment.color || 'gray']}`}>
                  {iconMap[selectedSegment.icon || 'layers']}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedSegment.name}</h2>
                  {selectedSegment.description && (
                    <p className="text-gray-500 mt-1">{selectedSegment.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-2xl font-bold text-emerald-600">
                      {matchingProfiles.length.toLocaleString()}
                    </span>
                    <span className="text-gray-500">matching profiles</span>
                  </div>
                </div>
              </div>

              {/* Rules Display */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Segment Rules</h3>
                <div className="space-y-2">
                  {selectedSegment.rule_groups.map((group, groupIndex) => (
                    <div key={group.id} className="space-y-2">
                      {group.rules.map((rule, ruleIndex) => {
                        const field = getField(rule.field);
                        const operators = field ? getOperatorsForType(field.type) : [];
                        const operatorLabel = operators.find(o => o.value === rule.operator)?.label || rule.operator;

                        return (
                          <div key={rule.id} className="flex items-center gap-2 text-sm">
                            {ruleIndex > 0 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                {group.join}
                              </span>
                            )}
                            <span className="font-medium text-gray-700">{field?.label || rule.field}</span>
                            <span className="text-gray-500">{operatorLabel}</span>
                            {!['is_blank', 'is_not_blank', 'is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(rule.operator) && (
                              <span className="font-semibold text-gray-900">
                                {rule.operator === 'between'
                                  ? `${rule.value} - ${rule.value2}`
                                  : String(rule.value)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mb-6">
              <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                <Mail className="w-4 h-4" />
                Send Campaign
              </button>
              <button
                onClick={() => setProfilesModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Users className="w-4 h-4" />
                View Profiles
              </button>
            </div>

            {/* Matching Profiles Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="font-medium text-gray-900">Matching Profiles</h3>
                <button
                  onClick={() => setProfilesModalOpen(true)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  View All →
                </button>
              </div>

              {/* Quick preview - first 5 profiles */}
              <div>
                {matchingProfiles.slice(0, 5).map((profile, idx) => (
                  <div
                    key={profile.id || profile.email || idx}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {profile.first_name || ''} {profile.last_name || ''}
                        {!profile.first_name && !profile.last_name && profile.email}
                      </p>
                      <p className="text-sm text-gray-500">{profile.email}</p>
                    </div>
                    <div className="text-right">
                      {profile.order_stats && (
                        <p className="text-sm font-medium text-emerald-600">
                          ${profile.order_stats.ltv.toFixed(2)} LTV
                        </p>
                      )}
                      <p className="text-xs text-gray-400">{profile._spoke_name}</p>
                    </div>
                  </div>
                ))}
                {matchingProfiles.length > 5 && (
                  <button
                    onClick={() => setProfilesModalOpen(true)}
                    className="w-full px-4 py-3 text-sm text-emerald-600 font-medium bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  >
                    View all {matchingProfiles.length} profiles →
                  </button>
                )}
                {matchingProfiles.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No profiles match this segment
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Select a Segment</h3>
              <p className="text-gray-500 mb-4">
                Choose a segment from the sidebar to view matching profiles
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Custom Segment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profiles Modal */}
      {selectedSegment && (
        <SegmentProfilesModal
          segment={selectedSegment}
          profiles={matchingProfiles}
          isOpen={profilesModalOpen}
          onClose={() => setProfilesModalOpen(false)}
        />
      )}
    </div>
  );
};

export default Segments;
