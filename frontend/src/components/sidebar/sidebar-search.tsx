import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { useNavigation } from '@/hooks/use-navigation';
import { debounce } from '@/lib/debounce';
import { cn } from '@/lib/utils';

export interface InputMetadataItem {
  id: string;
  label: string;
  help_text?: string | null;
  input_tab: string;
  sub_tab: string;
  yaml_section?: string;
  field_path?: string;
  section_label?: string | null;
}

export interface SidebarSearchProps {
  inputMetadata: InputMetadataItem[];
}

interface SearchEntry {
  fieldId: string;
  label: string;
  sectionId: string;
  subItemId: string;
  sectionLabel: string;
  searchText: string;
}

const SYN: Record<string, readonly string[]> = {
  'interest rate': ['wacc_nominal', 'social_discount_rate'],
  wire: ['conductor_type', 'old_conductor_type'],
  cable: ['conductor_type', 'old_conductor_type'],
  'cost of money': ['wacc_nominal'],
  discount: ['social_discount_rate', 'wacc_nominal'],
  greenfield: ['reconductoring'],
  reconductoring: ['reconductoring'],
  voltage: ['converter_loss_pct'],
  capacity: ['capacity_mw', 'existing_capacity_mw', 'old_capacity_mw', 'line_utilization'],
  utilization: ['line_utilization'],
  terrain: [
    'terrain_forested',
    'terrain_scrubbed_flat',
    'terrain_wetland',
    'terrain_farmland',
    'terrain_desert_barren',
    'terrain_urban',
    'terrain_rolling_hills',
    'terrain_mountain',
    'terrain_subsea',
  ],
  row: ['uses_existing_row'],
  'right of way': ['uses_existing_row'],
  wildfire: ['wf_uninsured_severity', 'wf_risk_growth_rate', 'wf_base_ignition_rate'],
  fire: ['wf_uninsured_severity', 'wf_base_ignition_rate'],
  outage: ['out_base_duration_hours', 'out_risk_growth_rate'],
  carbon: ['co2_cost_per_kg'],
  co2: ['co2_cost_per_kg'],
  emission: ['co2_cost_per_kg', 'sox_cost_per_kg', 'nox_cost_per_kg', 'compensation_percent'],
  fuel: ['grid_mix', 'energy_source_mix'],
  construction: ['construction_type', 'construction_years'],
  delay: ['delay_legal', 'delay_admin', 'delay_labor', 'delay_environmental', 'delay_years'],
  insurance: ['op_premium_rate'],
  vegetation: ['veg_forested_oh'],
  mitigation: ['mitigation_uplift_factor'],
  contingency: ['conductor_contingency', 'structure_contingency', 'converter_contingency'],
  converter: ['n_converters', 'converter_type', 'old_converter_type', 'converter_loss_pct'],
  circuit: ['n_circuits'],
  loss: ['loss_compensation_rate', 'compensation_percent', 'converter_loss_pct'],
  inflation: ['inflation_rate'],
  'base year': ['base_year'],
  afudc: ['apply_afudc'],
  rent: ['zone_1_rent_cost'],
  acquisition: ['zone_1_acquisition_cost'],
  conductor: ['conductor_type', 'old_conductor_type'],
  wacc: ['wacc_nominal'],
};

function sectionLabel(id: string): string {
  const section = SIDEBAR_SECTIONS.inputs.find((item) => item.id === id);
  return section?.label ?? id;
}

function buildSynonymMap(meta: InputMetadataItem[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const key of Object.keys(SYN)) {
    const ids: string[] = [];
    for (const token of SYN[key]) {
      for (const item of meta) {
        if (item.id.indexOf(token) !== -1 && ids.indexOf(item.id) < 0) ids.push(item.id);
      }
    }
    map[key] = ids;
  }
  return map;
}

function buildIndex(meta: InputMetadataItem[]): SearchEntry[] {
  return meta.map((item) => {
    const sl = sectionLabel(item.input_tab);
    return {
      fieldId: item.id,
      label: item.label,
      sectionId: item.input_tab,
      subItemId: item.sub_tab,
      sectionLabel: sl,
      searchText: `${item.label} ${item.help_text || ''} ${sl} ${item.section_label || ''}`.toLowerCase(),
    };
  });
}

function synonymIds(synMap: Record<string, string[]>, query: string, words: string[]): string[] {
  const ids: string[] = [];
  const lower = query.toLowerCase();
  for (const key of Object.keys(synMap)) {
    let hit = lower.indexOf(key) !== -1;
    if (!hit) {
      for (const word of words) {
        if (word === key || key.indexOf(word) !== -1) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    for (const id of synMap[key]) {
      if (ids.indexOf(id) < 0) ids.push(id);
    }
  }
  return ids;
}

function runSearch(index: SearchEntry[], synMap: Record<string, string[]>, query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (!q) return [];

  const matchedIds = synonymIds(synMap, q, words);
  const seen: Record<string, number> = {};
  const hits: SearchEntry[] = [];
  const add = (entry: SearchEntry): void => {
    if (!seen[entry.fieldId]) {
      seen[entry.fieldId] = 1;
      hits.push(entry);
    }
  };

  for (const id of matchedIds) {
    for (const entry of index) {
      if (entry.fieldId === id) add(entry);
    }
  }
  for (const entry of index) {
    let ok = true;
    for (const word of words) {
      if (entry.searchText.indexOf(word) === -1) {
        ok = false;
        break;
      }
    }
    if (ok) add(entry);
  }

  const bySection: Record<string, SearchEntry[]> = {};
  for (const hit of hits) {
    if (!bySection[hit.sectionId]) bySection[hit.sectionId] = [];
    bySection[hit.sectionId].push(hit);
  }

  const out: SearchEntry[] = [];
  for (const section of SIDEBAR_SECTIONS.inputs) {
    if (out.length >= 10) break;
    const bucket = bySection[section.id];
    if (!bucket) continue;
    for (const entry of bucket) {
      if (out.length >= 10) break;
      out.push(entry);
    }
  }
  return out;
}

export function SidebarSearch({ inputMetadata }: SidebarSearchProps): ReactElement {
  const { view, selectSubItem } = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [seenView, setSeenView] = useState(view);
  const wrapRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');
  const viewRef = useRef(view);
  const debouncedSearchRef = useRef<((value: string) => void) | null>(null);

  const index = useMemo(() => buildIndex(inputMetadata), [inputMetadata]);
  const synMap = useMemo(() => buildSynonymMap(inputMetadata), [inputMetadata]);
  const indexRef = useRef(index);
  const synMapRef = useRef(synMap);

  if (seenView !== view) {
    setSeenView(view);
    if (view !== 'inputs' && (open || results.length > 0 || activeIdx !== -1)) {
      setOpen(false);
      setResults([]);
      setActiveIdx(-1);
    }
  }

  useLayoutEffect(() => {
    indexRef.current = index;
    synMapRef.current = synMap;
    viewRef.current = view;
  }, [index, synMap, view]);

  useEffect(() => {
    let active = true;
    const run = debounce((...args: unknown[]) => {
      if (!active) return;
      const scheduled = typeof args[0] === 'string' ? args[0] : '';
      const live = queryRef.current.trim() === '' ? '' : scheduled;
      if (viewRef.current !== 'inputs' || !live.trim()) {
        setResults([]);
        setOpen(false);
        setActiveIdx(-1);
        return;
      }
      const next = runSearch(indexRef.current, synMapRef.current, live);
      setResults(next);
      setOpen(next.length > 0);
      setActiveIdx(-1);
    }, 200);
    debouncedSearchRef.current = (value: string) => {
      run(value);
    };
    return () => {
      active = false;
      debouncedSearchRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  function closeAndClear(): void {
    queryRef.current = '';
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function selectResult(entry: SearchEntry): void {
    selectSubItem(entry.sectionId, entry.subItemId);
    closeAndClear();
  }

  function onChange(value: string): void {
    queryRef.current = value;
    setQuery(value);
    if (viewRef.current !== 'inputs') {
      setResults([]);
      setOpen(false);
      setActiveIdx(-1);
      return;
    }
    debouncedSearchRef.current?.(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      closeAndClear();
      event.preventDefault();
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      setActiveIdx((current) => Math.min(current + 1, results.length - 1));
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      setActiveIdx((current) => Math.max(current - 1, 0));
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && activeIdx >= 0) {
      const entry = results[activeIdx];
      if (entry) selectResult(entry);
      event.preventDefault();
    }
  }

  const showDropdown = open && view === 'inputs' && results.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <input
        id="sidebar-search-input"
        type="text"
        value={query}
        placeholder="Search fields..."
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="sidebar-search-listbox"
        aria-activedescendant={activeIdx >= 0 ? `sidebar-search-option-${activeIdx}` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700/30"
      />
      {showDropdown ? (
        <div
          id="sidebar-search-listbox"
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 max-h-[300px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md"
        >
          {results.map((entry, index) => {
            const previous = results[index - 1];
            const showHeader = !previous || previous.sectionLabel !== entry.sectionLabel;
            const selected = index === activeIdx;
            return (
              <div key={entry.fieldId}>
                {showHeader ? (
                  <div className="px-3 pt-1.5 pb-0.5 text-[0.65rem] font-semibold text-neutral-400 uppercase">
                    {entry.sectionLabel}
                  </div>
                ) : null}
                <button
                  type="button"
                  id={`sidebar-search-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectResult(entry)}
                  className={cn(
                    'block w-full cursor-pointer px-3 py-1.5 text-left text-[0.8rem] text-slate-800 hover:bg-[rgba(0,100,200,0.05)]',
                    selected && 'bg-[rgba(0,100,200,0.08)]',
                  )}
                >
                  <strong>{entry.label}</strong>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
