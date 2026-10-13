import { create } from 'zustand';

export interface MapLayerState {
  visible: boolean;
  opacity: number;
}

export interface MapStore {
  layers: Record<string, MapLayerState>;
  toggleLayer: (id: string) => void;
  setOpacity: (id: string, value: number) => void;
}

const DEFAULT_LAYERS: Record<string, MapLayerState> = {
  'ref.counties_tiger': { visible: true, opacity: 0.4 },
  'ref.corridors_hifld': { visible: true, opacity: 0.7 },
  'ref.subregions_egrid': { visible: false, opacity: 0.3 },
};

export const useMapStore = create<MapStore>((set) => ({
  layers: DEFAULT_LAYERS,

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
}));
