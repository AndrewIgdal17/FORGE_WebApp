import { create } from 'zustand';

export interface MapLayerState {
  visible: boolean;
  opacity: number;
}

export interface MapStore {
  layers: Record<string, MapLayerState>;
  /** Attribute values hidden per layer. Empty array means every value is visible. */
  hiddenAttributes: Record<string, string[]>;
  toggleLayer: (id: string) => void;
  setOpacity: (id: string, value: number) => void;
  toggleAttribute: (layerId: string, value: string) => void;
  setHiddenAttributes: (layerId: string, values: readonly string[]) => void;
}

const DEFAULT_LAYERS: Record<string, MapLayerState> = {
  'ref.corridors': { visible: true, opacity: 0.7 },
  'ref.subregions_egrid': { visible: false, opacity: 0.3 },
  'ref.blm_zones': { visible: false, opacity: 0.6 },
  'ref.highways_nhs': { visible: false, opacity: 0.6 },
  'ref.rail_narn': { visible: false, opacity: 0.6 },
  'ref.substations_display': { visible: false, opacity: 0.8 },
};

const DEFAULT_HIDDEN_ATTRIBUTES: Record<string, string[]> = {
  'ref.corridors': [],
  'ref.subregions_egrid': [],
};

export const useMapStore = create<MapStore>((set) => ({
  layers: DEFAULT_LAYERS,
  hiddenAttributes: DEFAULT_HIDDEN_ATTRIBUTES,

  toggleLayer: (id) => {
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return state;
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, visible: !layer.visible },
        },
      };
    });
  },

  setOpacity: (id, value) => {
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return state;
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, opacity: value },
        },
      };
    });
  },

  toggleAttribute: (layerId, value) => {
    set((state) => {
      const current = state.hiddenAttributes[layerId] ?? [];
      const hidden = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return {
        hiddenAttributes: {
          ...state.hiddenAttributes,
          [layerId]: hidden,
        },
      };
    });
  },

  setHiddenAttributes: (layerId, values) => {
    set((state) => ({
      hiddenAttributes: {
        ...state.hiddenAttributes,
        [layerId]: [...values],
      },
    }));
  },
}));
