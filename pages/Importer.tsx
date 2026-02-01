
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Profile, Branch } from '../types';
import {
  Database, Upload, CheckCircle2,
  FileText, Sparkles, RefreshCw, Info, ShieldCheck,
  Activity, ArrowRight, Mail, AlertTriangle,
  Rocket, HelpCircle, X,
  ShieldAlert, Fingerprint, Network, FileUp, GitBranch,
  ChevronLeft, ChevronRight, Tag, Globe, Zap
} from 'lucide-react';
import { batchImportProfiles, fetchBranches } from '../lib/supabaseService';

console.log('=== IMPORTER LOADED ===');

// ========================================
// Types
// ========================================

interface ImporterProps {
  profiles: Profile[];
  onImportComplete: (newProfiles: Profile[]) => void;
}

interface FieldMapping {
  source: string;
  target: string;
  status: 'auto' | 'manual' | 'metadata';
}

interface ParsedRow {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string[];
  segments?: string[];
  spoke_uuid?: string;
  engagement_score?: number;
  location?: {
    latitude?: number;
    longitude?: number;
    timezone?: string;
    country_code?: string;
    region?: string;
  };
  metadata?: Record<string, any>;
}

// ========================================
// CSV Parsing Utilities
// ========================================

/**
 * Parse a single CSV line handling quoted fields properly
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Push the last field
  result.push(current.trim());

  return result;
}

/**
 * Parse CSV text into headers and raw rows
 * Auto-detects tab vs comma delimiter
 */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Auto-detect delimiter (tab vs comma)
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const headers = parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, '').trim());
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    if (values.length > 0 && values.some(v => v.trim())) {
      rows.push(values);
    }
  }

  return { headers, rows };
}

/**
 * Parse Mailchimp tag format: "TAG1","TAG2" into string[]
 * Handles formats:
 *   - "ATL_customer","VIP" → ["ATL_customer", "VIP"]
 *   - ATL_customer,VIP → ["ATL_customer", "VIP"]
 *   - "Single Tag" → ["Single Tag"]
 *   - Single Tag → ["Single Tag"]
 */
function parseMailchimpTags(tagsStr: string): string[] {
  console.log('parseMailchimpTags input:', JSON.stringify(tagsStr));

  if (!tagsStr || tagsStr.trim() === '') return [];

  const trimmed = tagsStr.trim();

  // Check if the string contains the quoted format: "TAG1","TAG2"
  if (trimmed.includes('"')) {
    const tags: string[] = [];

    // Match all quoted strings: "something"
    const quotePattern = /"([^"]*)"/g;
    let match: RegExpExecArray | null;

    while ((match = quotePattern.exec(trimmed)) !== null) {
      const tag = match[1].trim();
      if (tag) {
        tags.push(tag);
      }
    }

    // If we found quoted tags, return them
    if (tags.length > 0) {
      console.log('parseMailchimpTags output (quoted):', tags);
      return tags;
    }
  }

  // Fallback: simple comma-separated (no quotes)
  if (trimmed.includes(',')) {
    const result = trimmed.split(',').map(t => t.trim()).filter(Boolean);
    console.log('parseMailchimpTags output (comma-split):', result);
    return result;
  }

  // Single tag without quotes or commas
  console.log('parseMailchimpTags output (single):', [trimmed]);
  return [trimmed];
}

/**
 * Detect if CSV is in Mailchimp export format
 */
function detectMailchimpFormat(headers: string[]): boolean {
  const mailchimpIndicators = [
    'Email Address',
    'MEMBER_RATING',
    'LEID',
    'EUID',
    'OPTIN_TIME',
    'OPTIN_IP',
    'CONFIRM_TIME',
    'LATITUDE',
    'LONGITUDE',
    'GMTOFF',
    'DSTOFF',
    'TIMEZONE',
    'CC',
    'REGION'
  ];

  const normalizedHeaders = headers.map(h => h.trim());
  const matchCount = mailchimpIndicators.filter(indicator =>
    normalizedHeaders.includes(indicator)
  ).length;

  return matchCount >= 3;
}

/**
 * Generate field mappings based on headers with Mailchimp support
 */
function generateFieldMappings(headers: string[], isMailchimp: boolean): FieldMapping[] {
  const mappings: FieldMapping[] = [];

  for (const header of headers) {
    const h = header.toLowerCase().trim();
    const original = header.trim();
    let target = 'metadata';
    let status: 'auto' | 'manual' | 'metadata' = 'metadata';

    // Email mappings
    if (h === 'email' || h === 'email address' || h === 'email_address' || h === 'e-mail') {
      target = 'email';
      status = 'auto';
    }
    // Name mappings
    else if (h === 'first name' || h === 'first_name' || h === 'fname' || h === 'firstname' || h === 'first') {
      target = 'first_name';
      status = 'auto';
    }
    else if (h === 'last name' || h === 'last_name' || h === 'lname' || h === 'lastname' || h === 'last' || h === 'surname') {
      target = 'last_name';
      status = 'auto';
    }
    // Phone
    else if (h === 'phone' || h === 'phone number' || h === 'phone_number' || h === 'mobile' || h === 'tel') {
      target = 'phone';
      status = 'auto';
    }
    // Tags
    else if (h === 'tags' || h === 'tag' || h === 'labels') {
      target = 'tags';
      status = 'auto';
    }
    // Segments
    else if (h === 'segments' || h === 'segment' || h === 'groups') {
      target = 'segments';
      status = 'auto';
    }
    // Mailchimp specific mappings
    else if (isMailchimp) {
      if (h === 'leid' || h === 'euid') {
        target = 'spoke_uuid';
        status = 'auto';
      }
      else if (h === 'member_rating') {
        target = 'engagement_score';
        status = 'auto';
      }
      else if (h === 'latitude' || h === 'longitude' || h === 'timezone' || h === 'cc' || h === 'region') {
        target = 'location';
        status = 'auto';
      }
    }

    mappings.push({ source: original, target, status });
  }

  return mappings;
}

/**
 * Transform raw CSV rows into ParsedRow objects using field mappings
 */
function transformRows(
  headers: string[],
  rawRows: string[][],
  mappings: FieldMapping[]
): ParsedRow[] {
  const parsedRows: ParsedRow[] = [];

  for (const row of rawRows) {
    const parsed: ParsedRow = {
      email: '',
      metadata: {}
    };

    const locationData: ParsedRow['location'] = {};

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const value = row[i] || '';
      const mapping = mappings.find(m => m.source === header);

      if (!mapping || !value.trim()) continue;

      const target = mapping.target;

      switch (target) {
        case 'email':
          parsed.email = value.trim().toLowerCase();
          break;
        case 'first_name':
          parsed.first_name = value.trim();
          break;
        case 'last_name':
          parsed.last_name = value.trim();
          break;
        case 'phone':
          parsed.phone = value.trim();
          break;
        case 'tags':
          parsed.tags = parseMailchimpTags(value);
          console.log('Row tags for', parsed.email || '(email not yet parsed)', ':', parsed.tags);
          break;
        case 'segments':
          parsed.segments = value.split(',').map(s => s.trim()).filter(Boolean);
          break;
        case 'spoke_uuid':
          parsed.spoke_uuid = value.trim();
          break;
        case 'engagement_score':
          const score = parseInt(value, 10);
          if (!isNaN(score)) {
            // Mailchimp uses 1-5 rating, normalize to 0-100
            parsed.engagement_score = Math.min(100, score * 20);
          }
          break;
        case 'location':
          const h = header.toLowerCase();
          if (h === 'latitude') {
            const lat = parseFloat(value);
            if (!isNaN(lat)) locationData.latitude = lat;
          } else if (h === 'longitude') {
            const lng = parseFloat(value);
            if (!isNaN(lng)) locationData.longitude = lng;
          } else if (h === 'timezone') {
            locationData.timezone = value.trim();
          } else if (h === 'cc') {
            locationData.country_code = value.trim();
          } else if (h === 'region') {
            locationData.region = value.trim();
          }
          break;
        case 'skip':
          // Do nothing
          break;
        case 'metadata':
        default:
          if (parsed.metadata) {
            parsed.metadata[header] = value.trim();
          }
          break;
      }
    }

    // Add location if any fields were set
    if (Object.keys(locationData).length > 0) {
      parsed.location = locationData;
    }

    parsedRows.push(parsed);
  }

  return parsedRows;
}

// ========================================
// Constants
// ========================================

const STEPS = [
  { id: 'source', title: 'Source', icon: Database, desc: 'Connect Data' },
  { id: 'map', title: 'Mapping', icon: FileText, desc: 'Field Logic' },
  { id: 'audit', title: 'Audit', icon: ShieldCheck, desc: 'Deduplication' },
  { id: 'commit', title: 'Commit', icon: Rocket, desc: 'Global Sync' },
];

const PROFILE_FIELDS = [
  { value: 'skip', label: 'Skip this field' },
  { value: 'email', label: 'Email (required)' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'tags', label: 'Tags' },
  { value: 'segments', label: 'Segments' },
  { value: 'spoke_uuid', label: 'External ID (spoke_uuid)' },
  { value: 'engagement_score', label: 'Engagement Score' },
  { value: 'location', label: 'Location Data' },
  { value: 'metadata', label: 'Store as Metadata' },
];

const SOURCE_SITES = [
  { value: 'atlurbanfarms.com', label: 'ATL Urban Farms' },
  { value: 'farm.sproutify.app', label: 'Sproutify Farm App' },
  { value: 'sproutify.app', label: 'Sproutify Main' },
  { value: 'mailchimp', label: 'Mailchimp Export' },
  { value: 'other', label: 'Other Source' },
];

const AUDIT_PAGE_SIZE = 20;

// ========================================
// Component
// ========================================

const Importer: React.FC<ImporterProps> = ({ profiles, onImportComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [sourceType, setSourceType] = useState<'mailchimp' | 'supabase' | 'csv' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Branch selection state
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // CSV-specific state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  // Format detection
  const [isMailchimpFormat, setIsMailchimpFormat] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Source and pagination
  const [sourceSite, setSourceSite] = useState('atlurbanfarms.com');
  const [auditPage, setAuditPage] = useState(0);

  // Import results
  const [importResults, setImportResults] = useState<{ created: number; merged: number; errors: string[] } | null>(null);

  // Load branches on mount
  useEffect(() => {
    async function loadBranches() {
      try {
        const branches = await fetchBranches();
        setAvailableBranches(branches);
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    }
    loadBranches();
  }, []);

  // Get selected branch object
  const selectedBranch = useMemo(() => {
    return availableBranches.find(b => b.id === selectedBranchId) || null;
  }, [availableBranches, selectedBranchId]);

  // Re-parse rows when mappings change
  useEffect(() => {
    if (csvHeaders.length > 0 && csvRawRows.length > 0 && fieldMappings.length > 0) {
      const transformed = transformRows(csvHeaders, csvRawRows, fieldMappings);
      setParsedRows(transformed);
    }
  }, [csvHeaders, csvRawRows, fieldMappings]);

  // Handle file parsing
  const handleFileParsing = useCallback((file: File) => {
    setCsvFile(file);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { headers, rows } = parseCSV(text);

        const tagsIndex = headers.indexOf('TAGS');
        console.log('=== CSV PARSED ===', {
          headerCount: headers.length,
          rowCount: rows.length,
          tagsHeader: headers.includes('TAGS'),
          tagsIndex,
          row3Tags: tagsIndex >= 0 ? rows[2]?.[tagsIndex] : 'N/A'
        });

        if (headers.length === 0) {
          setParseError('No headers found in CSV file');
          return;
        }

        if (rows.length === 0) {
          setParseError('No data rows found in CSV file');
          return;
        }

        setCsvHeaders(headers);
        setCsvRawRows(rows);

        // Detect format
        const isMailchimp = detectMailchimpFormat(headers);
        setIsMailchimpFormat(isMailchimp);

        // Auto-set source site if Mailchimp detected
        if (isMailchimp) {
          setSourceSite('mailchimp');
        }

        // Generate field mappings
        const mappings = generateFieldMappings(headers, isMailchimp);
        setFieldMappings(mappings);

        // Transform rows
        const transformed = transformRows(headers, rows, mappings);
        setParsedRows(transformed);

        // Auto-select CSV source type
        setSourceType('csv');
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      }
    };
    reader.onerror = () => {
      setParseError('Failed to read file');
    };
    reader.readAsText(file);
  }, []);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileParsing(file);
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileParsing(file);
    } else {
      setParseError('Please drop a .csv file');
    }
  }, [handleFileParsing]);

  // Update a single field mapping
  const updateFieldMapping = (source: string, newTarget: string) => {
    setFieldMappings(prev => prev.map(m =>
      m.source === source
        ? { ...m, target: newTarget, status: 'manual' as const }
        : m
    ));
  };

  // Dedupe audit using parsed rows
  const dedupeAudit = useMemo(() => {
    const branchSlug = selectedBranch?.slug || sourceSite || 'csv_import';

    return parsedRows.map((incoming, idx) => {
      const existing = profiles.find(p => p.email.toLowerCase() === incoming.email.toLowerCase());
      const displayName = incoming.first_name
        ? `${incoming.first_name}${incoming.last_name ? ' ' + incoming.last_name : ''}`
        : incoming.email || `Row ${idx + 1}`;

      if (!incoming.email) {
        return {
          ...incoming,
          displayName,
          action: 'error' as const,
          impact: 'Missing email address',
          rowIndex: idx
        };
      }

      if (!existing) {
        return {
          ...incoming,
          displayName,
          action: 'create' as const,
          impact: 'New profile will be created',
          rowIndex: idx
        };
      }

      const siteExists = existing.branches?.includes(branchSlug);
      if (siteExists) {
        return {
          ...incoming,
          displayName,
          action: 'skip' as const,
          impact: 'Duplicate (same source)',
          rowIndex: idx
        };
      }

      return {
        ...incoming,
        displayName,
        action: 'merge' as const,
        impact: `Will merge with existing profile (${existing.branches?.length || 0} sources)`,
        rowIndex: idx
      };
    });
  }, [parsedRows, profiles, selectedBranch, sourceSite]);

  const stats = useMemo(() => {
    return {
      new: dedupeAudit.filter(a => a.action === 'create').length,
      merged: dedupeAudit.filter(a => a.action === 'merge').length,
      skipped: dedupeAudit.filter(a => a.action === 'skip').length,
      errors: dedupeAudit.filter(a => a.action === 'error').length,
    };
  }, [dedupeAudit]);

  // Paginated audit records
  const paginatedAudit = useMemo(() => {
    const start = auditPage * AUDIT_PAGE_SIZE;
    return dedupeAudit.slice(start, start + AUDIT_PAGE_SIZE);
  }, [dedupeAudit, auditPage]);

  const totalAuditPages = Math.ceil(dedupeAudit.length / AUDIT_PAGE_SIZE);

  // Transform parsed rows to profile objects for import
  const transformedProfiles = useMemo(() => {
    const branchSlug = selectedBranch?.slug || sourceSite || 'csv_import';

    return parsedRows.map(row => {
      const profile: Partial<Profile> = {
        email: row.email,
        first_name: row.first_name || '',
        last_name: row.last_name,
        phone: row.phone,
        tags: row.tags || [],
        segments: row.segments || [],
        branches: [branchSlug],
        spoke_uuid: row.spoke_uuid,
        engagement_score: row.engagement_score,
        metadata: {
          ...row.metadata,
          ...(row.location ? { location: row.location } : {}),
          import_source: sourceSite,
          import_date: new Date().toISOString(),
        },
      };

      return profile;
    });
  }, [parsedRows, selectedBranch, sourceSite]);

  const handleCommitImport = async () => {
    setIsProcessing(true);
    setImportProgress(0);

    try {
      const profilesToImport = transformedProfiles.filter(p => p.email);

      console.log('=== STARTING IMPORT ===', {
        totalProfiles: profilesToImport.length,
        sampleProfile: profilesToImport[0],
        branchSlug: selectedBranch?.slug,
        sourceSite
      });

      const results = await batchImportProfiles(profilesToImport, (current, total) => {
        setImportProgress(Math.round((current / total) * 100));
      });

      console.log('=== IMPORT COMPLETE ===', results);

      setImportResults(results);

      if (results.created > 0 || results.merged > 0) {
        onImportComplete([]);
      }

      setTimeout(() => {
        setIsProcessing(false);
      }, 500);
    } catch (err) {
      console.error('Import failed:', err);
      setImportResults({
        created: 0,
        merged: 0,
        errors: [err instanceof Error ? err.message : 'Unknown error occurred']
      });
      setIsProcessing(false);
    }
  };

  const resetImport = () => {
    setCurrentStep(0);
    setSourceType(null);
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRawRows([]);
    setFieldMappings([]);
    setParsedRows([]);
    setIsMailchimpFormat(false);
    setParseError(null);
    setSourceSite('atlurbanfarms.com');
    setAuditPage(0);
    setImportResults(null);
    setImportProgress(0);
    setSelectedBranchId(null);
  };

  const clearFile = () => {
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRawRows([]);
    setFieldMappings([]);
    setParsedRows([]);
    setIsMailchimpFormat(false);
    setParseError(null);
  };

  const hasEmailMapping = fieldMappings.some(m => m.target === 'email');
  const canProceedFromSource = csvFile && parsedRows.length > 0 && selectedBranchId;
  const canProceedFromMapping = hasEmailMapping;
  const canCommit = stats.new > 0 || stats.merged > 0;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-4 border-dashed rounded-[3rem] p-12 transition-all duration-300 ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50 scale-[1.02]'
                  : csvFile
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {!csvFile ? (
                <label className="flex flex-col items-center justify-center cursor-pointer">
                  <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 transition-all ${
                    isDragging ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <FileUp size={40} />
                  </div>
                  <p className="text-lg font-black text-slate-800 mb-2">
                    {isDragging ? 'Drop your CSV file here' : 'Drag & drop your CSV file'}
                  </p>
                  <p className="text-sm text-slate-500 mb-4">or click to browse</p>
                  <span className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition">
                    Select File
                  </span>
                  <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                </label>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center">
                        <FileText size={28} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-800">{csvFile.name}</p>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-sm text-slate-500">{parsedRows.length} records</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm text-slate-500">{csvHeaders.length} columns</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {isMailchimpFormat && (
                        <span className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-black uppercase flex items-center space-x-2">
                          <Mail size={14} />
                          <span>Mailchimp Format Detected</span>
                        </span>
                      )}
                      <button
                        onClick={clearFile}
                        className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {parseError && (
                    <div className="flex items-center space-x-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                      <AlertTriangle size={18} className="text-rose-500" />
                      <p className="text-sm font-bold text-rose-700">{parseError}</p>
                    </div>
                  )}

                  {/* Data Preview Table */}
                  {parsedRows.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Preview (first 5 records)</p>
                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Email</th>
                              <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Name</th>
                              <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Phone</th>
                              <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Tags</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {parsedRows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-slate-600 font-mono">{row.email || '-'}</td>
                                <td className="px-4 py-3 text-slate-600">
                                  {row.first_name || row.last_name
                                    ? `${row.first_name || ''} ${row.last_name || ''}`.trim()
                                    : '-'
                                  }
                                </td>
                                <td className="px-4 py-3 text-slate-600 font-mono">{row.phone || '-'}</td>
                                <td className="px-4 py-3">
                                  {row.tags && row.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {row.tags.slice(0, 3).map((tag, ti) => (
                                        <span key={ti} className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-bold">
                                          {tag}
                                        </span>
                                      ))}
                                      {row.tags.length > 3 && (
                                        <span className="text-slate-400 text-[10px]">+{row.tags.length - 3}</span>
                                      )}
                                    </div>
                                  ) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Source Type Cards - Only show after file is uploaded */}
            {csvFile && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { id: 'mailchimp', title: 'Mailchimp API', desc: 'Sync Audience Lists', icon: Mail, color: 'emerald', disabled: true },
                  { id: 'supabase', title: 'Supabase / SQL', desc: 'Direct DB Ingest', icon: Database, color: 'blue', disabled: true },
                  { id: 'csv', title: 'CSV Upload', icon: FileText, desc: 'Import from file', color: 'rose', disabled: false }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => !opt.disabled && setSourceType(opt.id as any)}
                    disabled={opt.disabled}
                    className={`group relative text-left p-8 rounded-[2rem] border-4 transition-all duration-300 ${
                      opt.disabled ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50' :
                      sourceType === opt.id
                        ? 'border-emerald-500 bg-emerald-50 shadow-xl'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:rotate-6 ${
                      sourceType === opt.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {React.createElement(opt.icon as any, { size: 24 })}
                    </div>
                    <h5 className="font-black text-slate-800 text-sm mb-1 uppercase tracking-tight">{opt.title}</h5>
                    <p className="text-[10px] text-slate-500 font-medium">{opt.desc}</p>
                    {opt.disabled && (
                      <span className="absolute top-4 right-4 text-[8px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">Soon</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Source Site & Branch Selection */}
            {csvFile && sourceType === 'csv' && (
              <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Source Site Dropdown */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2 flex items-center gap-2">
                      <Globe size={12} />
                      Data Source
                    </label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition shadow-inner"
                      value={sourceSite}
                      onChange={e => setSourceSite(e.target.value)}
                    >
                      {SOURCE_SITES.map(site => (
                        <option key={site.value} value={site.value}>
                          {site.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Branch Selection */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2 flex items-center gap-2">
                      <GitBranch size={12} />
                      Assign to Branch
                    </label>
                    {availableBranches.length === 0 ? (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={16} className="text-amber-500" />
                          <p className="text-xs font-bold text-amber-700">No branches found. Create one first.</p>
                        </div>
                      </div>
                    ) : (
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition shadow-inner"
                        value={selectedBranchId || ''}
                        onChange={e => setSelectedBranchId(e.target.value || null)}
                      >
                        <option value="">Select a branch...</option>
                        {availableBranches.map(branch => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name} ({branch.type})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {selectedBranch && (
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div
                      className="w-4 h-12 rounded"
                      style={{ backgroundColor: selectedBranch.primary_color || '#10b981' }}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{selectedBranch.name}</p>
                      <p className="text-xs text-slate-500">
                        Profiles will be tagged with: <span className="font-mono text-emerald-600">{selectedBranch.slug}</span>
                      </p>
                    </div>
                  </div>
                )}

                {!selectedBranchId && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle size={14} />
                    <p className="text-xs font-bold">Select a branch to continue</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 px-10 py-6 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Field Mappings</p>
                  {isMailchimpFormat && (
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-[9px] font-black uppercase">
                      Mailchimp
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-bold text-slate-400">{fieldMappings.length} columns</p>
              </div>
              <div className="p-10 space-y-4">
                {!hasEmailMapping && (
                  <div className="flex items-center space-x-3 p-4 bg-amber-50 border border-amber-100 rounded-xl mb-6">
                    <AlertTriangle size={18} className="text-amber-500" />
                    <p className="text-xs font-bold text-amber-700">You must map at least one column to Email to proceed</p>
                  </div>
                )}

                {fieldMappings.map((mapping) => (
                  <div key={mapping.source} className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-emerald-300 transition-colors">
                    <div className="flex items-center space-x-8">
                      <div className="space-y-1 min-w-[180px]">
                        <p className="text-[9px] font-black text-slate-400 uppercase">CSV Column</p>
                        <p className="text-sm font-black text-slate-800 font-mono truncate">{mapping.source}</p>
                      </div>
                      <ArrowRight className="text-slate-300" />
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Profile Field</p>
                        <select
                          value={mapping.target}
                          onChange={e => updateFieldMapping(mapping.source, e.target.value)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold outline-none transition border min-w-[180px] ${
                            mapping.target === 'email' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            mapping.target === 'skip' ? 'bg-white text-slate-400 border-slate-200' :
                            mapping.target === 'metadata' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {PROFILE_FIELDS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                        mapping.status === 'auto' ? 'bg-emerald-100 text-emerald-700' :
                        mapping.status === 'manual' ? 'bg-blue-100 text-blue-700' :
                        'bg-violet-100 text-violet-700'
                      }`}>
                        {mapping.status}
                      </span>
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                        mapping.target === 'skip' ? 'bg-slate-100 text-slate-400' :
                        mapping.target === 'email' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {mapping.target === 'skip' ? 'Skipped' : 'Mapped'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-4 gap-6">
              {[
                { label: 'New Profiles', value: stats.new, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Will Merge', value: stats.merged, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Duplicates', value: stats.skipped, color: 'text-slate-400', bg: 'bg-slate-50' },
                { label: 'Errors', value: stats.errors, color: 'text-rose-600', bg: 'bg-rose-50' }
              ].map(stat => (
                <div key={stat.label} className="bg-white p-6 rounded-[2rem] border border-slate-200 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                  <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-[3rem] border-4 border-slate-100 overflow-hidden shadow-sm">
              <div className="px-10 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Deduplication Preview</h4>
                <div className="flex items-center space-x-4">
                  <span className="text-[10px] font-bold text-slate-400">
                    Showing {auditPage * AUDIT_PAGE_SIZE + 1}-{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, dedupeAudit.length)} of {dedupeAudit.length}
                  </span>
                  {totalAuditPages > 1 && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                        disabled={auditPage === 0}
                        className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-bold text-slate-600">
                        {auditPage + 1} / {totalAuditPages}
                      </span>
                      <button
                        onClick={() => setAuditPage(p => Math.min(totalAuditPages - 1, p + 1))}
                        disabled={auditPage >= totalAuditPages - 1}
                        className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                    <tr>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase">Profile</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Tags</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Impact</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedAudit.map((audit, i) => (
                      <tr key={audit.rowIndex} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-800">{audit.displayName}</p>
                          <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{audit.email || 'No email'}</p>
                        </td>
                        <td className="px-6 py-4">
                          {audit.tags && audit.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {audit.tags.slice(0, 3).map((tag, ti) => (
                                <span key={ti} className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-bold">
                                  {tag}
                                </span>
                              ))}
                              {audit.tags.length > 3 && (
                                <span className="text-slate-400 text-[9px]">+{audit.tags.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-500 max-w-[200px]">
                          {audit.impact}
                        </td>
                        <td className="px-8 py-4 text-right">
                          <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                            audit.action === 'create' ? 'bg-emerald-100 text-emerald-700' :
                            audit.action === 'merge' ? 'bg-indigo-100 text-indigo-700' :
                            audit.action === 'error' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-400'
                          }`}>
                            {audit.action}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 3:
        if (importResults) {
          return (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-white p-12 rounded-[4rem] border-4 border-slate-100 shadow-2xl text-center max-w-2xl mx-auto">
                <div className={`w-24 h-24 ${importResults.errors.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'} rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-lg border ${importResults.errors.length > 0 ? 'border-amber-200' : 'border-emerald-200'}`}>
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase mb-4">Import Complete</h3>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-emerald-50 p-6 rounded-2xl">
                    <p className="text-4xl font-black text-emerald-600">{importResults.created}</p>
                    <p className="text-[10px] font-black text-emerald-700 uppercase">Created</p>
                  </div>
                  <div className="bg-indigo-50 p-6 rounded-2xl">
                    <p className="text-4xl font-black text-indigo-600">{importResults.merged}</p>
                    <p className="text-[10px] font-black text-indigo-700 uppercase">Merged</p>
                  </div>
                </div>

                {importResults.errors.length > 0 && (
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 mb-8 text-left max-h-[200px] overflow-y-auto">
                    <p className="text-[10px] font-black text-rose-700 uppercase mb-3">Errors ({importResults.errors.length})</p>
                    <ul className="space-y-1">
                      {importResults.errors.map((err, i) => (
                        <li key={i} className="text-xs text-rose-600 font-mono">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={resetImport}
                  className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition"
                >
                  Start New Import
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white p-12 rounded-[4rem] border-4 border-slate-100 shadow-2xl text-center max-w-2xl mx-auto">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-lg border border-emerald-200">
                <ShieldCheck size={48} />
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase mb-4">Ready to Import</h3>
              <p className="text-slate-500 text-sm font-medium mb-12 leading-relaxed">
                This will create <b>{stats.new} new profiles</b> and merge <b>{stats.merged} existing profiles</b> in your database.
                {stats.errors > 0 && <span className="text-rose-500"> {stats.errors} rows will be skipped due to errors.</span>}
              </p>

              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 mb-12 text-left space-y-4">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Source File</span>
                  <span className="text-slate-900 font-mono">{csvFile?.name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Data Source</span>
                  <span className="text-slate-900">{SOURCE_SITES.find(s => s.value === sourceSite)?.label || sourceSite}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Branch</span>
                  <span className="text-slate-900 flex items-center gap-2">
                    {selectedBranch && (
                      <span
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: selectedBranch.primary_color || '#10b981' }}
                      />
                    )}
                    {selectedBranch?.name || 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Format Type</span>
                  <span className="text-slate-900 flex items-center gap-2">
                    {isMailchimpFormat ? (
                      <>
                        <Mail size={12} className="text-amber-500" />
                        Mailchimp Export
                      </>
                    ) : (
                      <>
                        <FileText size={12} className="text-blue-500" />
                        Standard CSV
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Total Records</span>
                  <span className="text-slate-900">{parsedRows.length}</span>
                </div>
              </div>

              <button
                onClick={handleCommitImport}
                disabled={!canCommit}
                className={`w-full py-8 rounded-[2.5rem] font-black text-2xl flex items-center justify-center space-x-6 shadow-2xl transition active:scale-95 group ${
                  canCommit
                    ? 'bg-slate-900 text-white hover:bg-emerald-600'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Rocket size={32} className={canCommit ? 'text-emerald-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform' : 'text-slate-300'} />
                <span>{canCommit ? 'Execute Import' : 'Nothing to Import'}</span>
              </button>

              {!canCommit && (
                <p className="text-xs text-slate-400 mt-4">
                  No new profiles to create or merge. All records are duplicates or have errors.
                </p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 pb-40 relative">

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg text-white">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Import Help</h3>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">CSV Import Guide</p>
                </div>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-2 text-slate-400 hover:text-white transition"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/50">
              <section className="space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                  <Fingerprint size={16} className="mr-2 text-emerald-600" />
                  How It Works
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  Upload a CSV file with your contacts. The importer will match by <b>email address</b> to prevent duplicates.
                  Existing profiles will have their data merged (tags, sources combined).
                </p>
              </section>

              <section className="space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                  <Zap size={16} className="mr-2 text-amber-600" />
                  Mailchimp Auto-Detection
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  Mailchimp exports are automatically detected. Special fields like <b>MEMBER_RATING</b>, <b>TAGS</b>,
                  <b>LEID</b>, and location data are mapped automatically.
                </p>
              </section>

              <section className="space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                  <Network size={16} className="mr-2 text-blue-600" />
                  Supported Fields
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {PROFILE_FIELDS.filter(f => f.value !== 'skip').map(f => (
                    <div key={f.value} className="p-3 bg-white rounded-xl border border-slate-100">
                      <p className="text-xs font-black text-slate-700">{f.label}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                <div className="flex items-center space-x-2 mb-2">
                  <ShieldAlert size={16} className="text-amber-600" />
                  <p className="text-[10px] font-black text-amber-900 uppercase">Important</p>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                  Your CSV must have an <b>email column</b>. Each row becomes one profile.
                  Tags can be in Mailchimp format ("TAG1","TAG2") or comma-separated.
                </p>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white">
              <button onClick={() => setShowHelp(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition">
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Stepper */}
      <div className="lg:col-span-3 space-y-12">
        <div className="flex justify-between items-start relative px-10">
          <div className="absolute top-7 left-20 right-20 h-1 bg-slate-100 -z-10 rounded-full">
            <div className="h-full bg-emerald-500 transition-all duration-700 rounded-full" style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}></div>
          </div>
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center group cursor-pointer" onClick={() => !isProcessing && idx <= currentStep && setCurrentStep(idx)}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${
                  isActive ? 'bg-slate-900 text-white border-emerald-500 scale-110' :
                  isCompleted ? 'bg-emerald-600 text-white border-white' :
                  'bg-white text-slate-300 border-slate-100'
                }`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <step.icon size={24} />}
                </div>
                <div className="mt-4 text-center">
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.title}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-h-[500px]">
          {renderStep()}
        </div>

        {!importResults && (
          <div className="flex justify-between items-center pt-10 border-t border-slate-200">
            <div className="flex items-center space-x-4">
              <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0 || isProcessing} className="px-10 py-5 flex items-center space-x-3 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-800 transition disabled:opacity-0 group">
                <ArrowRight className="rotate-180" size={16} />
                <span>Back</span>
              </button>

              {csvFile && (
                <button
                  onClick={resetImport}
                  disabled={isProcessing}
                  className="px-6 py-3 flex items-center space-x-2 text-rose-500 font-black text-[10px] uppercase tracking-widest hover:text-rose-700 hover:bg-rose-50 rounded-xl transition disabled:opacity-50"
                >
                  <X size={14} />
                  <span>Cancel Import</span>
                </button>
              )}
            </div>

            {currentStep < STEPS.length - 1 && (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={
                  (currentStep === 0 && !canProceedFromSource) ||
                  (currentStep === 1 && !canProceedFromMapping) ||
                  isProcessing
                }
                className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-600 transition disabled:opacity-50"
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Side Panel */}
      <div className="lg:col-span-1 space-y-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm min-h-[500px] flex flex-col relative overflow-hidden">
          <button
            onClick={() => setShowHelp(true)}
            className="absolute top-8 right-8 text-slate-300 hover:text-emerald-500 transition-colors p-2"
            title="Import Help"
          >
            <HelpCircle size={24} />
          </button>

          <div className="flex items-center space-x-4 mb-10 pb-10 border-b border-slate-100">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-lg border border-indigo-100">
              <Upload size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">CSV Importer</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step {currentStep + 1} of {STEPS.length}</p>
            </div>
          </div>

          <div className="flex-1 space-y-6">
            {csvFile && (
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-emerald-700 uppercase">File Loaded</p>
                  {isMailchimpFormat && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded text-[8px] font-black uppercase">
                      MC
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-emerald-800 truncate">{csvFile.name}</p>
                <p className="text-xs text-emerald-600">{parsedRows.length} rows, {csvHeaders.length} columns</p>
              </div>
            )}

            {selectedBranch && (
              <div className="p-6 rounded-2xl border space-y-2" style={{ backgroundColor: `${selectedBranch.primary_color}10`, borderColor: `${selectedBranch.primary_color}30` }}>
                <p className="text-[10px] font-black uppercase" style={{ color: selectedBranch.primary_color }}>Target Branch</p>
                <p className="text-sm font-bold text-slate-800">{selectedBranch.name}</p>
                <p className="text-xs text-slate-500 font-mono">/{selectedBranch.slug}</p>
              </div>
            )}

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase">Import Preview</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">New profiles</span>
                  <span className="font-bold text-emerald-600">{stats.new}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Merges</span>
                  <span className="font-bold text-indigo-600">{stats.merged}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Skipped</span>
                  <span className="font-bold text-slate-400">{stats.skipped}</span>
                </div>
                {stats.errors > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Errors</span>
                    <span className="font-bold text-rose-500">{stats.errors}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center space-x-3">
                <Info size={14} className="text-slate-400" />
                <p className="text-[9px] font-bold text-slate-500 leading-tight">
                  Profiles are matched by email address. Existing profiles will have tags and sources merged.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[200] flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in duration-500">
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-emerald-500 rounded-full blur-[120px] opacity-20 animate-pulse"></div>
            <Activity size={80} className="text-emerald-400 animate-pulse relative z-10" />
          </div>
          <h2 className="text-4xl font-black mb-6 tracking-tight uppercase">Importing Profiles...</h2>
          <div className="w-full max-w-xl bg-white/10 rounded-full h-4 overflow-hidden mb-8 border border-white/5 shadow-2xl">
            <div className="bg-emerald-500 h-full transition-all duration-300 relative" style={{ width: `${importProgress}%` }}>
              <div className="absolute inset-0 bg-white/40 animate-pulse"></div>
            </div>
          </div>
          <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse">{importProgress}% Complete</p>
          <p className="text-xs font-bold text-slate-400 mt-4">Creating new profiles and merging existing ones...</p>
        </div>
      )}
    </div>
  );
};

export default Importer;
